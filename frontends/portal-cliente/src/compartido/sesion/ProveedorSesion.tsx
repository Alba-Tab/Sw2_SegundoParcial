import { InMemoryWebStorage, WebStorageStateStore } from 'oidc-client-ts';
import { type ReactNode, useEffect } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { usarToken } from '../../api/cliente';
import { configuracion } from '../../configuracion';

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
  onSigninCallback: () => window.history.replaceState({}, document.title, window.location.pathname),
};

function TokenEnElCliente({ children }: { children: ReactNode }) {
  const auth = useAuth();
  usarToken(auth.user?.access_token);
  useEffect(() => usarToken(auth.user?.access_token), [auth.user]);
  return children;
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  return (
    <AuthProvider {...oidc}>
      <TokenEnElCliente>{children}</TokenEnElCliente>
    </AuthProvider>
  );
}
