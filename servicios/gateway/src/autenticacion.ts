import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PresupuestoLlamadas } from './presupuesto';

/** Roles con acceso al Centro de Control; `cliente` y `chofer` no (spec 016). */
export const ROLES_INTERNOS = ['gerente', 'despachador', 'jefe_flota', 'administracion', 'comercial'] as const;
export type Rol = (typeof ROLES_INTERNOS)[number];

export interface Usuario {
  sub: string;
  nombre?: string;
  roles: Rol[];
  token: string;
  /** Vencimiento del token en ms (la suscripción se cierra con 4401 al llegar). */
  venceMs: number;
}

/** Aviso que no es error: por ejemplo, la escritura se aplicó pero no se pudo releer el recurso. */
export interface Aviso {
  mensaje: string;
  codigo?: string;
  servicio?: string;
  path?: (string | number)[];
}

/** Contexto de cada operación GraphQL. */
export interface Contexto {
  usuario: Usuario;
  correlationId: string;
  traceparent: string;
  cargadores?: unknown;
  /** Van en `extensions.avisos` de la respuesta. */
  avisos?: Aviso[];
  /** Tope de llamadas a los servicios de una petición HTTP a `/graphql` (ver `presupuesto.ts`). */
  presupuesto?: PresupuestoLlamadas;
}

export class TokenInvalido extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/**
 * Valida el token de las apps: emisor OIDC_ISSUER, audiencia `gateway`, firma y vencimiento (spec 016, paso 6). Un
 * token de `cliente` o `chofer` es válido pero no entra: 403 SIN_PERMISO (FK1).
 */
export class Autenticador {
  private readonly llaves?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly issuer: string,
    private readonly audiencia: string,
    llaves?: ReturnType<typeof createRemoteJWKSet>,
  ) {
    this.llaves = llaves ?? (issuer ? createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`)) : undefined);
  }

  async validar(cabecera: string | undefined): Promise<Usuario> {
    if (!this.llaves) throw new TokenInvalido(503, 'DEPENDENCIA_NO_DISPONIBLE', 'OIDC_ISSUER no está configurado');
    const token = cabecera?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new TokenInvalido(401, 'NO_AUTENTICADO', 'Falta el token');
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.llaves, { issuer: this.issuer, audience: this.audiencia }));
    } catch (e) {
      if (e instanceof Error && e.name === 'JWKSTimeout') throw new TokenInvalido(503, 'DEPENDENCIA_NO_DISPONIBLE', 'Keycloak no responde');
      throw new TokenInvalido(401, 'NO_AUTENTICADO', 'El token no es válido');
    }
    const todos = ((payload['realm_access'] as { roles?: unknown[] } | undefined)?.roles ?? []).filter(
      (r): r is string => typeof r === 'string',
    );
    const roles = todos.filter((r): r is Rol => (ROLES_INTERNOS as readonly string[]).includes(r));
    if (roles.length === 0) throw new TokenInvalido(403, 'SIN_PERMISO', 'Tu cuenta no tiene acceso al Centro de Control');
    return {
      sub: String(payload.sub),
      nombre: (payload['name'] as string | undefined) ?? (payload['preferred_username'] as string | undefined),
      roles,
      token,
      venceMs: (payload.exp ?? 0) * 1000,
    };
  }
}

/** W3C Trace Context: continúa el `traceparent` de la app o empieza uno (el Gateway es la raíz, D23). */
export function traceparent(entrante: string | undefined): string {
  const m = entrante?.match(/^00-([0-9a-f]{32})-[0-9a-f]{16}-([0-9a-f]{2})$/);
  return `00-${m?.[1] ?? randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-${m?.[2] ?? '01'}`;
}

export function correlationId(entrante: string | undefined): string {
  return entrante && /^[0-9a-f-]{36}$/i.test(entrante) ? entrante : randomUUID();
}
