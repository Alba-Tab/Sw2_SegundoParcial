import { ErrorResponse } from 'oidc-client-ts';
import { hasAuthParams, useAuth } from 'react-oidc-context';

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

/**
 * La página a la que hay que volver después de pasar por Keycloak (enlace del correo, "Ver como cliente"). Viaja como
 * `state` del pedido de autorización; en la vuelta misma (con `code` en la URL) no hay a dónde volver más que al inicio.
 */
export function destinoActual(): string {
  if (hasAuthParams()) return '/';
  return window.location.pathname + window.location.search;
}

/** Solo una ruta de este mismo origen: un `state` raro (o `//otro-sitio`) lleva al inicio. */
export function destinoSeguro(state: unknown): string {
  return typeof state === 'string' && state.startsWith('/') && !state.startsWith('//') && !state.includes('\\') ? state : '/';
}

/** Keycloak rechazó el refresh token: la sesión se cerró (en otra app, D27) o venció. Un corte de red no lo es. */
export function sesionPerdida(error: unknown): boolean {
  return error instanceof ErrorResponse && error.error === 'invalid_grant';
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
    iniciar: () => auth.signinRedirect({ state: destinoActual() }),
    // Keycloak abre su formulario de registro con prompt=create (spec 001, paso 1).
    crearCuenta: () => auth.signinRedirect({ prompt: 'create', state: destinoActual() }),
    cerrar: () => auth.signoutRedirect(),
    renovar: async () => {
      await auth.signinSilent();
    },
  };
}
