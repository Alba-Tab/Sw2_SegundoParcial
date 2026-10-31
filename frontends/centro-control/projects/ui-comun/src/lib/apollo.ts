import { inject, type Provider, type EnvironmentProviders } from '@angular/core';
import { ApolloLink, InMemoryCache } from '@apollo/client/core';
import { ErrorLink } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { createClient } from 'graphql-ws';
import { Observable, type Subscription } from 'rxjs';
import { CONFIG_CENTRO } from './configuracion';
import { EstadoConexion, esperaReconexion } from './conexion';
import { Sesion } from './sesion';

// Respuesta parcial (spec 016): las consultas devuelven los datos que llegaron junto con los errores por campo.
declare module '@apollo/client' {
  export namespace ApolloClient {
    export namespace DeclareDefaultOptions {
      interface WatchQuery {
        errorPolicy: 'all';
      }
      interface Query {
        errorPolicy: 'all';
      }
    }
  }
}

/**
 * Con 401 renueva el token y repite la operación una vez (spec 016). Si no hay token nuevo, la operación termina con el
 * error original, no vacía. Al cancelar (la página se destruyó o el sondeo cambió de variables) se cancela también la
 * repetición en curso, o no se hace si la renovación todavía no volvió.
 */
export function reintentarCon401(renovar: () => Promise<string | undefined>): ErrorLink.ErrorHandler {
  return ({ error, operation, forward }) => {
    const status = (error as { statusCode?: number } | undefined)?.statusCode;
    if (status !== 401 || operation.getContext()['reintentado']) return;
    return new Observable<ApolloLink.Result>((observador) => {
      let repeticion: Subscription | undefined;
      let cancelada = false;
      renovar().then(
        (token) => {
          if (cancelada) return;
          if (!token) return observador.error(error);
          operation.setContext({ reintentado: true, headers: { Authorization: `Bearer ${token}` } });
          repeticion = forward(operation).subscribe(observador);
        },
        () => {
          if (!cancelada) observador.error(error);
        },
      );
      return () => {
        cancelada = true;
        repeticion?.unsubscribe();
      };
    });
  };
}

/**
 * Apollo hacia el Gateway (spec 016): el token va en `Authorization` (HTTP) y en `connection_init` (WebSocket), nunca
 * en la URL. Con 401 renueva el token y repite una vez. Los cortes de red los reintenta graphql-ws con espera creciente;
 * los cierres fatales (4401 al vencer el token o a los 3.600 s de Cloud Run) los reintenta `Alertas` con un token nuevo.
 */
export function proveerApollo(): (Provider | EnvironmentProviders)[] {
  return [
    provideApollo(() => {
      const config = inject(CONFIG_CENTRO);
      const sesion = inject(Sesion);
      const conexion = inject(EstadoConexion);
      const http = inject(HttpLink).create({ uri: `${config.gatewayUrl}/graphql` });

      const conToken = new ApolloLink((operacion, siguiente) => {
        operacion.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
          headers: { ...headers, Authorization: `Bearer ${sesion.token() ?? ''}` },
        }));
        return siguiente(operacion);
      });

      const reintento401 = new ErrorLink(reintentarCon401(() => sesion.renovar()));

      const ws = new GraphQLWsLink(
        createClient({
          url: `${config.gatewayUrl.replace(/^http/, 'ws')}/graphql`,
          lazy: true,
          connectionParams: async () => {
            await sesion.renovarSiHaceFalta();
            return { authorization: `Bearer ${sesion.token() ?? ''}` };
          },
          retryAttempts: Number.POSITIVE_INFINITY,
          // graphql-ws 6 trata 4401 como fatal y no lo reintenta: la suscripción termina con error y `Alertas` renueva el
          // token y vuelve a suscribirse. 4403 (rol sin alertas: cliente o chofer) tampoco se reintenta aquí ni allí.
          shouldRetry: (e) => !(e && typeof e === 'object' && 'code' in e && (e as CloseEvent).code === 4403),
          retryWait: async (intento) => new Promise((ok) => setTimeout(ok, esperaReconexion(intento))),
          on: {
            connected: (_s, _p, reintento) => {
              conexion.conectado.set(true);
              conexion.conexiones.update((n) => n + 1);
              if (reintento) conexion.reconexiones.update((n) => n + 1);
            },
            closed: () => conexion.conectado.set(false),
          },
        }),
      );

      const esSuscripcion = ({ query }: { query: Parameters<typeof getMainDefinition>[0] }) => {
        const d = getMainDefinition(query);
        return d.kind === 'OperationDefinition' && d.operation === 'subscription';
      };

      return {
        link: ApolloLink.split(esSuscripcion, ws, ApolloLink.from([conToken, reintento401, http])),
        cache: new InMemoryCache(),
        defaultOptions: {
          watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
          query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
        },
      };
    }),
  ];
}
