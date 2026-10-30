import { inject, type Provider, type EnvironmentProviders } from '@angular/core';
import { ApolloLink, InMemoryCache } from '@apollo/client/core';
import { ErrorLink } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { createClient } from 'graphql-ws';
import { Observable } from 'rxjs';
import { CONFIG_CENTRO } from './configuracion';
import { EstadoConexion } from './conexion';
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

/** D99: reconexión con espera creciente 1, 2, 4… s, máximo 30 s. */
export const esperaReconexion = (intento: number) => Math.min(30_000, 1000 * 2 ** intento);

/**
 * Apollo hacia el Gateway (spec 016): el token va en `Authorization` (HTTP) y en `connection_init` (WebSocket), nunca
 * en la URL. Con 401 renueva el token y repite una vez; la suscripción reconecta con un token renovado.
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

      const reintento401 = new ErrorLink(({ error, operation, forward }) => {
        const status = (error as { statusCode?: number } | undefined)?.statusCode;
        if (status !== 401 || operation.getContext()['reintentado']) return;
        return new Observable((observador) => {
          void sesion.renovar().then((token) => {
            if (!token) return observador.complete();
            operation.setContext({ reintentado: true, headers: { Authorization: `Bearer ${token}` } });
            forward(operation).subscribe(observador);
          });
        });
      });

      const ws = new GraphQLWsLink(
        createClient({
          url: `${config.gatewayUrl.replace(/^http/, 'ws')}/graphql`,
          lazy: true,
          connectionParams: async () => {
            await sesion.renovarSiHaceFalta();
            return { authorization: `Bearer ${sesion.token() ?? ''}` };
          },
          retryAttempts: Number.POSITIVE_INFINITY,
          // 4403: rol sin alertas (cliente o chofer); no tiene sentido reintentar. 4401 se reintenta con token nuevo.
          shouldRetry: (e) => !(e && typeof e === 'object' && 'code' in e && (e as CloseEvent).code === 4403),
          retryWait: async (intento) => new Promise((ok) => setTimeout(ok, esperaReconexion(intento))),
          on: {
            connected: (_s, _p, reintento) => {
              conexion.conectado.set(true);
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
