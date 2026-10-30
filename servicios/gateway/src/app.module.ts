import type { ApolloServerPlugin } from '@apollo/server';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Controller, Get, Inject, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { IntercambioToken } from '@transporte/intercambio-token';
import type { NextFunction, Request, Response } from 'express';
import { GraphQLError, type GraphQLFormattedError, type GraphQLSchema } from 'graphql';
import type { Context as ContextoWs } from 'graphql-ws';
import type { WebSocket } from 'ws';
import { Autenticador, correlationId, TokenInvalido, traceparent, type Contexto, type Usuario } from './autenticacion';
import { configuracion } from './configuracion';
import { cuerpoProblema } from './errores';
import { ExportacionesController } from './exportaciones.controller';
import { crearCargadores } from './graphql/cargadores';
import { limiteComplejidad, limiteProfundidad } from './graphql/limites';
import { crearResolvers } from './graphql/resolvers';
import { aplicarRoles } from './graphql/roles';
import { DURACION_MAXIMA_MS } from './graphql/suscripcion';
import { registrar, traceIdDe } from './log';
import { ClienteServicios } from './servicios';
import { AUTENTICADOR, HMAC_SECRETO, INTERCAMBIO } from './tokens-inyeccion';

const config = configuracion();
const intercambio = new IntercambioToken({
  issuer: config.issuer || 'http://sin-issuer',
  clienteId: 'gateway',
  clienteSecreto: config.clienteSecreto || '-',
});
const autenticador = new Autenticador(config.issuer, config.audiencia);
const servicios = new ClienteServicios(intercambio, config);
let esquema: GraphQLSchema;

const problema = (res: Response, e: TokenInvalido) => {
  if (e.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="transporte"');
  if (e.status === 503) res.setHeader('Retry-After', '30');
  res
    .status(e.status)
    .type('application/problem+json')
    .json(cuerpoProblema(e.status, e.codigo, e.message));
};

/** `POST /graphql` sin token → 401; con rol `cliente` o `chofer` → 403 (FK1). Antes de que Apollo ejecute nada. */
function autenticarHttp(req: Request & { contexto?: Contexto }, res: Response, siguiente: NextFunction) {
  if (req.method === 'OPTIONS') return siguiente();
  autenticador
    .validar(req.header('authorization'))
    .then((usuario) => {
      req.contexto = {
        usuario,
        correlationId: correlationId(req.header('x-correlation-id')),
        traceparent: traceparent(req.header('traceparent')),
      };
      siguiente();
    })
    .catch((e) => (e instanceof TokenInvalido ? problema(res, e) : siguiente(e)));
}

function contextoCompleto(base: Contexto) {
  return { ...base, cargadores: crearCargadores(servicios, base), avisos: [] };
}

/** Errores de Apollo que son culpa de la petición: consulta mal escrita, variables, operación inexistente. */
const ERRORES_DE_CLIENTE = new Set([
  'GRAPHQL_PARSE_FAILED',
  'GRAPHQL_VALIDATION_FAILED',
  'BAD_USER_INPUT',
  'BAD_REQUEST',
  'OPERATION_RESOLUTION_FAILURE',
]);

/** El error con nuestro `codigo` (el que lanzó un resolver o el cliente REST), si lo hay. */
const conCodigo = (error: unknown): GraphQLError | undefined =>
  error instanceof GraphQLError ? (error.originalError instanceof GraphQLError ? error.originalError : error) : undefined;

const esInterno = (error: unknown, code: unknown) => !conCodigo(error)?.extensions['codigo'] && !ERRORES_DE_CLIENTE.has(String(code));

/** Errores con `codigo` y `status` de 000 §5; sin trazas internas hacia las apps. */
function formatearError(formateado: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = conCodigo(error);
  const extensiones = { ...(original?.extensions ?? formateado.extensions ?? {}) } as Record<string, unknown>;
  const code = formateado.extensions?.['code'];
  delete extensiones['stacktrace'];
  delete extensiones['http'];
  if (!extensiones['codigo']) {
    if (ERRORES_DE_CLIENTE.has(String(code))) Object.assign(extensiones, { codigo: 'VALIDACION', status: 400 });
    else extensiones['codigo'] = 'ERROR_INTERNO';
  }
  const interno = extensiones['codigo'] === 'ERROR_INTERNO';
  return {
    message: interno ? 'Error interno del Gateway' : formateado.message,
    path: formateado.path,
    locations: formateado.locations,
    extensions: extensiones,
  };
}

/**
 * Registra en el log JSON (000 §10), con `correlationId` y `traceId`, cada error interno antes de que `formatError` lo
 * enmascare; y pone los avisos de la operación en `extensions.avisos` de la respuesta.
 */
const registroYAvisos: ApolloServerPlugin<Contexto> = {
  async requestDidStart() {
    return {
      async didEncounterErrors({ contextValue, errors }) {
        for (const e of errors) {
          if (!esInterno(e, e.extensions?.['code'])) continue;
          const causa = e.originalError ?? e;
          registrar('ERROR', 'Error interno en una operación GraphQL', {
            correlationId: contextValue?.correlationId,
            traceId: traceIdDe(contextValue?.traceparent),
            path: e.path,
            error: causa.message,
            pila: causa.stack,
          });
        }
      },
      async willSendResponse({ contextValue, response }) {
        const avisos = contextValue?.avisos;
        if (avisos?.length && response.body.kind === 'single') {
          response.body.singleResult.extensions = { ...response.body.singleResult.extensions, avisos };
        }
      },
    };
  },
};

@Controller()
class SaludController {
  constructor(@Inject(AUTENTICADOR) private readonly a: Autenticador) {}
  @Get('health')
  salud() {
    return { estado: 'UP' };
  }
  @Get('health/ready')
  async lista() {
    // El Gateway no tiene base: informa qué servicios responden, pero siempre está listo para responder parcial.
    const urls = { viajes: config.viajesUrl, flota: config.flotaUrl, finanzas: config.finanzasUrl, analitica: config.analiticaUrl };
    const dependencias: Record<string, string> = {};
    await Promise.all(
      Object.entries(urls).map(async ([n, u]) => {
        dependencias[n] = await fetch(`${u}/health`, { signal: AbortSignal.timeout(1500) }).then(
          (r) => (r.ok ? 'UP' : 'DOWN'),
          () => 'DOWN',
        );
      }),
    );
    return { estado: 'UP', dependencias };
  }
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [config.esquema],
      resolvers: crearResolvers({ servicios, hmacSecreto: config.hmacSecreto, gatewayUrl: config.gatewayUrl }),
      transformSchema: (s) => (esquema = aplicarRoles(s)),
      introspection: config.introspeccion,
      // Sin "¿quisiste decir…?" en los errores de validación: no revelan el esquema con la introspección apagada.
      hideSchemaDetailsFromClientErrors: true,
      playground: false,
      csrfPrevention: false,
      validationRules: [limiteProfundidad()],
      plugins: [limiteComplejidad(() => esquema), registroYAvisos as ApolloServerPlugin],
      formatError: formatearError,
      context: ({ req, extra }: { req?: Request & { contexto?: Contexto }; extra?: { contexto?: Contexto } }) =>
        contextoCompleto((req?.contexto ?? extra?.contexto) as Contexto),
      subscriptions: {
        'graphql-ws': {
          path: '/graphql',
          // El token va en el payload de connection_init, nunca en la URL (spec 016, paso 13).
          onConnect: async (ctx: ContextoWs<Record<string, unknown> | undefined, unknown>) => {
            const extra = ctx.extra as { socket: WebSocket; contexto?: Contexto };
            const socket = extra.socket;
            let usuario: Usuario;
            try {
              usuario = await autenticador.validar(String(ctx.connectionParams?.['authorization'] ?? ''));
            } catch (e) {
              // D77: token inválido → 4401; cliente o chofer → 4403.
              socket.close(e instanceof TokenInvalido && e.status === 403 ? 4403 : 4401, e instanceof Error ? e.message : 'No autenticado');
              return false;
            }
            if (!usuario.roles.some((r) => r !== 'comercial')) {
              socket.close(4403, 'Tu rol no recibe alertas');
              return false;
            }
            extra.contexto = { usuario, correlationId: correlationId(undefined), traceparent: traceparent(undefined) };
            const alVencer = setTimeout(() => socket.close(4401, 'El token venció'), Math.max(0, usuario.venceMs - Date.now()));
            const alLimite = setTimeout(() => socket.close(4401, 'Duración máxima de la conexión'), DURACION_MAXIMA_MS);
            socket.once('close', () => (clearTimeout(alVencer), clearTimeout(alLimite)));
            return true;
          },
        },
      },
    }),
  ],
  controllers: [SaludController, ExportacionesController],
  providers: [
    { provide: ClienteServicios, useValue: servicios },
    { provide: INTERCAMBIO, useValue: intercambio },
    { provide: HMAC_SECRETO, useValue: config.hmacSecreto },
    { provide: AUTENTICADOR, useValue: autenticador },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(autenticarHttp).forRoutes('graphql');
  }
}
