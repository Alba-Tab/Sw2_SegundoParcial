import { All, Controller, Get, Module, Req, Res } from '@nestjs/common';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { IntercambioToken } from '@transporte/intercambio-token';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Autenticador, NoAutorizado, type Llamador } from './autenticacion';
import { configuracion } from './configuracion';
import { LimitePeticiones } from './limite';
import { crearServidor, type Auditar, auditarEnLog } from './servidor';
import { ClienteServicios, type Contexto } from './servicios';

export interface Dependencias {
  autenticador: Autenticador;
  servicios: ClienteServicios;
  limite: LimitePeticiones;
  auditar: Auditar;
}

export function dependenciasPorDefecto(): Dependencias {
  const c = configuracion();
  const intercambio = new IntercambioToken({
    issuer: c.issuer || 'http://sin-issuer',
    clienteId: 'mcp-server',
    clienteSecreto: c.clienteSecreto || '-',
  });
  return {
    autenticador: new Autenticador(c.issuer, c.audiencia, c.clientes),
    servicios: new ClienteServicios(intercambio, c),
    limite: new LimitePeticiones(c.limitePorMinuto),
    auditar: auditarEnLog,
  };
}

const problema = (res: Response, status: number, codigo: string, detail: string) =>
  res
    .status(status)
    .type('application/problem+json')
    .json({ type: `https://transporte.local/errores/${codigo.toLowerCase()}`, title: codigo, status, codigo, detail });

/**
 * `POST /mcp` (spec 014): token con audiencia `mcp-server` y `azp` registrado, límite por minuto, y la petición pasa al
 * handler del SDK v2 (2026-07-28, sin sesiones; las peticiones 2025 se atienden igual, sin estado).
 */
export function crearControlador(d: Dependencias) {
  const handler: McpHttpHandler = createMcpHandler((c) => {
    const extra = c.authInfo?.extra as { llamador: Llamador; base: Omit<Contexto, 'llamador'> };
    return crearServidor(extra.llamador, extra.base, d.servicios, d.auditar);
  });

  @Controller()
  class McpController {
    @Get('health')
    salud() {
      return { estado: 'UP' };
    }

    @All('mcp')
    async mcp(@Req() req: Request, @Res() res: Response) {
      let llamador: Llamador;
      try {
        llamador = await d.autenticador.validar(req.header('authorization'));
      } catch (e) {
        const n = e instanceof NoAutorizado ? e : new NoAutorizado(401, 'NO_AUTENTICADO', 'El token no es válido');
        if (n.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="transporte", resource="mcp-server"');
        return problema(res, n.status, n.codigo, n.message);
      }
      const espera = d.limite.tomar(`${llamador.sub}|${llamador.azp}`);
      if (espera) {
        res.setHeader('Retry-After', String(espera));
        return problema(res, 429, 'LIMITE_PETICIONES', 'Pasaste las 30 llamadas por minuto');
      }
      const base: Omit<Contexto, 'llamador'> = {
        correlationId: req.header('x-correlation-id') ?? randomUUID(),
        traceparent: req.header('traceparent') ?? undefined,
        misionId: req.header('x-mision-id') ?? undefined,
      };
      const cabeceras = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cabeceras.set(k, v);
      const cuerpo = req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined;
      const peticion = new Request(`http://${req.headers.host ?? 'localhost'}${req.originalUrl}`, {
        method: req.method,
        headers: cabeceras,
        body: cuerpo,
      });
      const respuesta = await handler.fetch(peticion, {
        parsedBody: req.method === 'POST' ? req.body : undefined,
        authInfo: { token: llamador.token, clientId: llamador.azp, scopes: [], extra: { llamador, base } },
      });
      res.status(respuesta.status);
      respuesta.headers.forEach((valor, clave) => res.setHeader(clave, valor));
      if (!respuesta.body) return res.end();
      Readable.fromWeb(respuesta.body as never).pipe(res);
    }
  }
  return McpController;
}

export function crearModulo(d: Dependencias = dependenciasPorDefecto()) {
  @Module({ controllers: [crearControlador(d)] })
  class AppModule {}
  return AppModule;
}
