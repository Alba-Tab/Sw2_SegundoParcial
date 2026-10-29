import { Injectable, NestMiddleware, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { AUDIENCIA, entorno } from '../configuracion/entorno';

export interface Usuario {
  sub: string;
  roles: string[];
  clienteId?: string;
}

export function rolesDelRealm(payload: JWTPayload): string[] {
  const acceso = payload['realm_access'] as { roles?: unknown } | undefined;
  return Array.isArray(acceso?.roles) ? acceso.roles.filter((r): r is string => typeof r === 'string') : [];
}

/**
 * /api/** exige un JWT de Keycloak con emisor OIDC_ISSUER y audiencia "flota"; /health queda libre. Es middleware (no
 * guard) para que también aplique a rutas inexistentes: 401/503 antes que 404, igual que en Viajes.
 * Las llaves se bajan en la primera petición (createRemoteJWKSet es perezoso), así Flota arranca sin Keycloak.
 * P10: sin OIDC_ISSUER, /api/** responde 503 DEPENDENCIA_NO_DISPONIBLE.
 */
@Injectable()
export class AutenticacionMiddleware implements NestMiddleware {
  private readonly issuer = entorno().OIDC_ISSUER.replace(/\/$/, '');
  private readonly llaves = this.issuer ? createRemoteJWKSet(new URL(`${this.issuer}/protocol/openid-connect/certs`)) : undefined;

  async use(req: Request & { usuario?: Usuario }, res: Response, siguiente: NextFunction) {
    if (!this.llaves) {
      res.setHeader('Retry-After', '30');
      throw new ErrorDeDominio('DEPENDENCIA_NO_DISPONIBLE', 'OIDC_ISSUER no está configurado');
    }
    const token = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Falta el token');
    try {
      const { payload } = await jwtVerify(token, this.llaves, { issuer: this.issuer, audience: AUDIENCIA });
      req.usuario = { sub: String(payload.sub), roles: rolesDelRealm(payload), clienteId: payload['clienteId'] as string | undefined };
    } catch (e) {
      if (e instanceof Error && e.name === 'JWKSTimeout') throw new ServiceUnavailableException('Keycloak no responde');
      throw new UnauthorizedException('El token no es válido');
    }
    siguiente();
  }
}
