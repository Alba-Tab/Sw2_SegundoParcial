import { All, type ArgumentsHost, Catch, Controller, type ExceptionFilter, Get, HttpException, Module, Req, Res } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { IntercambioToken } from '@transporte/intercambio-token';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Autenticador, NoAutorizado, type Llamador } from './autenticacion';
import { configuracion } from './configuracion';
import { LimitePeticiones } from './limite';
import { HERRAMIENTAS } from './herramientas/herramientas';
import { registrar } from './log';
import { crearServidor, herramientasPara, lineaAuditoria, type Auditar, auditarEnLog } from './servidor';
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

/** Problem Details (000 §5) con el `type` en minúsculas y guiones. */
const problema = (res: Response, status: number, codigo: string, detail: string) =>
  res
    .status(status)
    .type('application/problem+json')
    .json({ type: `https://transporte.local/errores/${codigo.toLowerCase().replace(/_/g, '-')}`, title: codigo, status, codigo, detail });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

/** El `X-Correlation-Id` del cliente si es un UUID; si no llega o no lo es, uno nuevo (000 §4). */
export const correlationIdDe = (entrante: string | undefined) => (entrante && UUID.test(entrante) ? entrante : randomUUID());

/** Las llamadas a herramientas (`tools/call`) de un cuerpo JSON-RPC, sea un mensaje o un lote. */
export function llamadasAHerramientas(cuerpo: unknown): string[] {
  return (Array.isArray(cuerpo) ? cuerpo : [cuerpo])
    .filter((m): m is { method: string; params?: { name?: unknown } } => !!m && typeof m === 'object' && m.method === 'tools/call')
    .map((m) => (typeof m.params?.name === 'string' ? m.params.name : ''));
}

/** `mcp.<herramienta>` solo con nombres del catálogo: un nombre inventado no entra al log tal cual. */
const conocida = (nombre: string) => HERRAMIENTAS.find((h) => h.nombre === nombre);
const accionDe = (nombre: string) => `mcp.${conocida(nombre)?.nombre ?? 'desconocida'}`;

/**
 * Errores fuera del handler MCP como Problem Details: un JSON roto (Nest lo convierte en 400) → `400 VALIDACION`, sin
 * repetir el mensaje del parser; lo inesperado → 500 sin trazas, registrado en el log JSON.
 */
@Catch()
export class FiltroProblemas implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const x = e as { status?: number; statusCode?: number; type?: string; message?: string };
    const status = e instanceof HttpException ? e.getStatus() : Number(x?.status ?? x?.statusCode ?? 500);
    if (status >= 400 && status < 500) {
      const json = x?.type === 'entity.parse.failed' || (status === 400 && /JSON/i.test(String(x?.message ?? '')));
      const codigo = status === 404 ? 'NO_ENCONTRADO' : status === 401 ? 'NO_AUTENTICADO' : status === 403 ? 'SIN_PERMISO' : 'VALIDACION';
      return problema(res, status, codigo, json ? 'El cuerpo no es un JSON válido' : 'Petición inválida');
    }
    registrar('ERROR', 'Error no controlado', {
      error: e instanceof Error ? e.message : String(e),
      pila: e instanceof Error ? e.stack : undefined,
    });
    return problema(res, 500, 'ERROR_INTERNO', 'Error interno del servidor MCP');
  }
}

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
      const base: Omit<Contexto, 'llamador'> = {
        correlationId: correlationIdDe(req.header('x-correlation-id')),
        traceparent: TRACEPARENT.test(req.header('traceparent') ?? '') ? req.header('traceparent') : undefined,
        misionId: req.header('x-mision-id') ?? undefined,
      };
      // D91: también se audita la llamada rechazada (límite, herramienta desconocida u oculta), sin sus argumentos.
      const rechazo = (nombre: string, resultado: string) =>
        d.auditar(lineaAuditoria(llamador, base.correlationId, accionDe(nombre), resultado, { entidad: conocida(nombre)?.entidad }));
      // El límite cuenta solo las llamadas a herramientas, no tools/list, ping ni la inicialización.
      const llamadas = llamadasAHerramientas(req.body);
      let espera = 0;
      for (let i = 0; i < llamadas.length; i++) espera = Math.max(espera, d.limite.tomar(`${llamador.sub}|${llamador.azp}`));
      if (espera) {
        for (const nombre of llamadas) rechazo(nombre, 'LIMITE_PETICIONES');
        res.setHeader('Retry-After', String(espera));
        return problema(res, 429, 'LIMITE_PETICIONES', 'Pasaste las 30 llamadas por minuto');
      }
      // El SDK responde -32602 a una herramienta que no existe o que el rol no ve (no revela cuál de las dos).
      const visibles = new Set(herramientasPara(llamador.roles).map((h) => h.nombre));
      for (const nombre of llamadas) if (!visibles.has(nombre)) rechazo(nombre, '-32602');
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
  @Module({ controllers: [crearControlador(d)], providers: [{ provide: APP_FILTER, useClass: FiltroProblemas }] })
  class AppModule {}
  return AppModule;
}
