import { McpServer, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { Llamador } from './autenticacion';
import { argumentosMision, argumentosRedactar, misionVigilarViajes, redactarRespuestaReporte, VOCABULARIO } from './herramientas/catalogo';
import { HERRAMIENTAS, MAX_SALIDA, type Herramienta } from './herramientas/herramientas';
import { ClienteServicios, ErrorHerramienta, type Contexto } from './servicios';

export type Auditar = (linea: Record<string, unknown>) => void;

/** Línea JSON de auditoría por llamada (000 §9): el MCP no tiene base, va a los logs (D91). */
export const auditarEnLog: Auditar = (linea) => process.stdout.write(`${JSON.stringify(linea)}\n`);

const ROLES_AUDITADOS = ['agente_lectura', 'gerente', 'despachador', 'jefe_flota', 'administracion'];
const rolDe = (llamador: Llamador) => llamador.roles.find((r) => ROLES_AUDITADOS.includes(r)) ?? null;

/** Las herramientas que el rol del token puede ver y llamar. */
export const herramientasPara = (roles: string[]) => HERRAMIENTAS.filter((h) => h.roles.some((r) => roles.includes(r)));

/**
 * Una línea de auditoría con el esquema de 000 §9 (`id`, `ocurridoEn`, `actorSub`, `actorRol`, `canal`, `accion`,
 * `entidad`, `entidadId`, `datos`, `correlationId`), más `azp`, `resultado` y `ms`. `datos` nunca lleva texto libre.
 */
export function lineaAuditoria(
  llamador: Llamador,
  correlationId: string,
  accion: string,
  resultado: string,
  extra: { entidad?: string | null; entidadId?: string | null; datos?: Record<string, unknown>; ms?: number } = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    ocurridoEn: new Date().toISOString(),
    canal: 'SISTEMA',
    accion,
    entidad: extra.entidad ?? null,
    entidadId: extra.entidadId ?? null,
    actorSub: llamador.sub,
    actorRol: rolDe(llamador),
    azp: llamador.azp,
    correlationId,
    datos: extra.datos ?? {},
    resultado,
    ...(extra.ms !== undefined ? { ms: extra.ms } : {}),
  };
}

const error = (codigo: string, mensaje: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ codigo, mensaje }) }],
  structuredContent: { codigo, mensaje },
});

/**
 * El esquema que se publica en `tools/list` es el zod `.strict()` de la herramienta, pero el SDK no lo aplica: si lo
 * hiciera, los argumentos inválidos saldrían como texto "Input validation error" sin `codigo`. La validación la hace
 * el handler con el mismo zod y responde `isError` con `codigo = VALIDACION` (spec 014, FM1).
 */
function publicado(entrada: z.ZodObject): StandardSchemaWithJSON {
  return {
    '~standard': {
      version: 1,
      vendor: 'transporte',
      validate: (valor: unknown) => ({ value: valor }),
      jsonSchema: entrada['~standard'].jsonSchema,
    },
  } as StandardSchemaWithJSON;
}

/** "placa: Placa como 4521KTR; texto: Solo letras, números y espacios" (sin repetir el valor recibido). */
const mensajeValidacion = (e: z.ZodError) =>
  e.issues.map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message)).join('; ');

/** Si una herramienta no tiene `entidadId`, null; la salida solo cuenta si la llamada salió bien. */
const entidadDe = (h: Herramienta, args: Record<string, unknown> | undefined, salida?: Record<string, unknown>) => ({
  entidad: h.entidad,
  entidadId: (args && h.entidadId?.(args, salida)) ?? null,
});

/**
 * Un McpServer por petición (especificación 2026-07-28, sin sesiones): solo se registran las herramientas que permite
 * el rol del token. Así `tools/list` del agente muestra 6, y una oculta responde -32602 sin revelar que existe.
 */
export function crearServidor(
  llamador: Llamador,
  base: Omit<Contexto, 'llamador'>,
  servicios: ClienteServicios,
  auditar: Auditar = auditarEnLog,
) {
  const servidor = new McpServer({ name: 'transporte-mcp', version: '1.0.0' }, { capabilities: { tools: {}, resources: {}, prompts: {} } });
  const ctx: Contexto = { ...base, llamador };

  for (const h of herramientasPara(llamador.roles)) {
    servidor.registerTool(
      h.nombre,
      { description: h.descripcion, inputSchema: publicado(h.entrada), outputSchema: h.salida },
      async (crudos: unknown) => {
        const inicio = Date.now();
        const entrada = h.entrada.safeParse(crudos ?? {});
        let resultado: ReturnType<typeof error> | { content: { type: 'text'; text: string }[]; structuredContent: Record<string, unknown> };
        let salida: Record<string, unknown> | undefined;
        if (!entrada.success) {
          resultado = error('VALIDACION', mensajeValidacion(entrada.error));
        } else {
          try {
            salida = h.salida.parse(await h.ejecutar(entrada.data, ctx, servicios)) as Record<string, unknown>;
            const texto = JSON.stringify(salida);
            if (Buffer.byteLength(texto) > MAX_SALIDA)
              throw new ErrorHerramienta('VALIDACION', 'La salida pasa de 16 KB: acota la consulta');
            resultado = { content: [{ type: 'text', text: texto }], structuredContent: salida };
          } catch (e) {
            salida = undefined;
            resultado =
              e instanceof ErrorHerramienta
                ? error(e.codigo, e.message)
                : error(
                    'ERROR_INTERNO',
                    e instanceof Error && e.name === 'ZodError' ? 'Respuesta inesperada del servicio' : 'Error interno',
                  );
          }
        }
        const args = entrada.success ? (entrada.data as Record<string, unknown>) : undefined;
        auditar(
          lineaAuditoria(
            llamador,
            ctx.correlationId,
            `mcp.${h.nombre}`,
            'isError' in resultado ? resultado.structuredContent.codigo : 'OK',
            {
              ...entidadDe(h, args, salida),
              // Con argumentos inválidos no se guarda nada de lo recibido.
              datos: args ? (h.auditable ? h.auditable(args) : args) : {},
              ms: Date.now() - inicio,
            },
          ),
        );
        return resultado;
      },
    );
  }

  servidor.registerResource(
    'vocabulario',
    'vocabulario://negocio',
    { mimeType: 'text/plain', description: 'Vocabulario del negocio' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/plain', text: VOCABULARIO }],
    }),
  );
  servidor.registerResource(
    'reportes',
    'catalogo://reportes',
    { mimeType: 'application/json', description: 'Los 5 reportes, parámetros y roles' },
    async (uri) => {
      const r = await servicios.llamar<Record<string, unknown>>(ctx, 'analitica', 'GET', '/api/v1/reportes');
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(r['reportes']) }] };
    },
  );
  servidor.registerResource(
    'rutas',
    'catalogo://rutas',
    { mimeType: 'application/json', description: 'Rutas activas con destino y distancia' },
    async (uri) => {
      const r = await servicios.llamar<Record<string, unknown>>(ctx, 'viajes', 'GET', '/api/v1/rutas');
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(r['items'] ?? r) }] };
    },
  );

  servidor.registerPrompt(
    'mision_vigilar_viajes',
    { description: 'Misión del agente (spec 014)', argsSchema: argumentosMision },
    async (a) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: misionVigilarViajes(Number(a.umbralRiesgo ?? 0.7), Number(a.maxPasos ?? 8)) },
        },
      ],
    }),
  );
  servidor.registerPrompt(
    'redactar_respuesta_reporte',
    { description: 'Redacción de la respuesta por voz (spec 015)', argsSchema: argumentosRedactar },
    async (a) => ({
      messages: [{ role: 'user', content: { type: 'text', text: redactarRespuestaReporte(a.pregunta, a.reporteId, a.resultado) } }],
    }),
  );
  return servidor;
}
