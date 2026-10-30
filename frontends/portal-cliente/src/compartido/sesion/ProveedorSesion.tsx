import { InMemoryWebStorage, type User, WebStorageStateStore } from 'oidc-client-ts';
import { type ReactNode, useEffect } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { alRecibir401, usarToken } from '../../api/cliente';
import { configuracion } from '../../configuracion';
import { volverAEntrar } from './reentrada';
import { destinoSeguro, sesionPerdida } from './useSesion';

const oidc = {
  authority: configuracion.oidcIssuer,
  client_id: configuracion.clienteOidc,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  scope: 'openid',
  // Tokens en memoria (propuesta 7.7); al recargar, Keycloak devuelve la sesión por redirección sin pedir clave.
  userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  // Renueva con el refresh token antes de que venza el access token (sin iframe silencioso).
  automaticSilentRenew: true,
};

function TokenEnElCliente({ children }: { children: ReactNode }) {
  const auth = useAuth();
  usarToken(auth.user?.access_token);
  useEffect(() => usarToken(auth.user?.access_token), [auth.user]);

  // Si Keycloak rechaza la renovación (invalid_grant) o la API responde 401, se vuelve a pedir la sesión en vez de
  // quedar "autenticado" con un token vencido mostrando "Error 401".
  const { events, removeUser, signinRedirect } = auth;
  useEffect(() => {
    const reentrar = () => void volverAEntrar(removeUser, (destino) => signinRedirect({ state: destino }));
    const quitar = events.addSilentRenewError((e) => {
      if (sesionPerdida(e)) reentrar();
    });
    alRecibir401(reentrar);
    return () => {
      quitar();
      alRecibir401(undefined);
    };
  }, [events, removeUser, signinRedirect]);
  return children;
}

/**
 * Sesión OIDC. `navegar` lleva, al volver de Keycloak, a la página que se pidió antes de iniciar sesión (el `state`):
 * el enlace del correo (`/servicios/{id}`, `/facturas/{id}`) o "Ver como cliente" llegan a su página.
 */
export function ProveedorSesion({ children, navegar }: { children: ReactNode; navegar: (destino: string) => void }) {
  const alVolver = (usuario: User | undefined) => navegar(destinoSeguro(usuario?.state));
  return (
    <AuthProvider {...oidc} onSigninCallback={alVolver}>
      <TokenEnElCliente>{children}</TokenEnElCliente>
    </AuthProvider>
  );
}
