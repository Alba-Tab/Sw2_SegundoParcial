import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Llamador {
  sub: string;
  azp: string;
  roles: string[];
  token: string;
}

export class NoAutorizado extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Audiencia `mcp-server` y `azp` de un cliente registrado (spec 014, seguridad del MCP). */
export class Autenticador {
  private readonly llaves?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly issuer: string,
    private readonly audiencia: string,
    private readonly clientes: string[],
    llaves?: ReturnType<typeof createRemoteJWKSet>,
  ) {
    this.llaves = llaves ?? (issuer ? createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`)) : undefined);
  }

  async validar(cabecera: string | undefined): Promise<Llamador> {
    if (!this.llaves) throw new NoAutorizado(503, 'DEPENDENCIA_NO_DISPONIBLE', 'OIDC_ISSUER no está configurado');
    const token = cabecera?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new NoAutorizado(401, 'NO_AUTENTICADO', 'Falta el token');
    try {
      const { payload } = await jwtVerify(token, this.llaves, { issuer: this.issuer, audience: this.audiencia });
      const azp = String(payload['azp'] ?? '');
      if (!this.clientes.includes(azp)) throw new NoAutorizado(403, 'SIN_PERMISO', `El cliente ${azp || '(sin azp)'} no puede usar el MCP`);
      const roles = ((payload['realm_access'] as { roles?: unknown[] } | undefined)?.roles ?? []).filter(
        (r): r is string => typeof r === 'string',
      );
      return { sub: String(payload.sub), azp, roles, token };
    } catch (e) {
      if (e instanceof NoAutorizado) throw e;
      if (e instanceof Error && e.name === 'JWKSTimeout') throw new NoAutorizado(503, 'DEPENDENCIA_NO_DISPONIBLE', 'Keycloak no responde');
      throw new NoAutorizado(401, 'NO_AUTENTICADO', 'El token no es válido');
    }
  }
}
