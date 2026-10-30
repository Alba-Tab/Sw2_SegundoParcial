import { useAuth } from 'react-oidc-context';

export interface Sesion {
  autenticado: boolean;
  cargando: boolean;
  /** Keycloak no respondió o rechazó el inicio de sesión. */
  error?: Error;
  sub?: string;
  nombre?: string;
  roles: string[];
  /** Del token (spec 001): falta hasta que Viajes vincula al usuario con su cliente. */
  clienteId?: string;
  esCliente: boolean;
  esComercial: boolean;
  /** Usuario recién registrado: todavía no completó los datos de su empresa o no está vinculado. */
  necesitaEmpresa: boolean;
  iniciar: () => Promise<void>;
  crearCuenta: () => Promise<void>;
  cerrar: () => Promise<void>;
  /** Pide un token nuevo con el refresh token (después de vincular, el token trae clienteId y el rol). */
  renovar: () => Promise<void>;
}

interface Reclamos {
  sub?: string;
  name?: string;
  preferred_username?: string;
  clienteId?: string;
  realm_access?: { roles?: string[] };
}

/** Lee el payload del access token (sin validar: la firma la validan los servicios). */
export function reclamosDe(token?: string): Reclamos {
  if (!token) return {};
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))) as Reclamos;
  } catch {
    return {};
  }
}

export function useSesion(): Sesion {
  const auth = useAuth();
  const r = reclamosDe(auth.user?.access_token);
  const roles = r.realm_access?.roles ?? [];
  const esCliente = roles.includes('cliente');
  const esComercial = roles.includes('comercial');
  return {
    autenticado: auth.isAuthenticated,
    cargando: auth.isLoading && !auth.error,
    error: auth.error,
    sub: r.sub,
    nombre: r.name ?? r.preferred_username,
    roles,
    clienteId: r.clienteId,
    esCliente,
    esComercial,
    necesitaEmpresa: auth.isAuthenticated && !esComercial && !(esCliente && r.clienteId),
    iniciar: () => auth.signinRedirect(),
    // Keycloak abre su formulario de registro con prompt=create (spec 001, paso 1).
    crearCuenta: () => auth.signinRedirect({ prompt: 'create' }),
    cerrar: () => auth.signoutRedirect(),
    renovar: async () => {
      await auth.signinSilent();
    },
  };
}
