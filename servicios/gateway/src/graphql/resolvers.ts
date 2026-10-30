import { createHmac } from 'node:crypto';
import type { Contexto } from '../autenticacion';
import { errorGraphql } from '../errores';
import { ESPERA, type ClienteServicios } from '../servicios';
import type { Cargadores } from './cargadores';
import { Cursor, Dinero, Fecha, Instante, JSONEscalar } from './escalares';
import * as m from './mapeos';
import { alertasNuevas } from './suscripcion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = Contexto & { cargadores: Cargadores };
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const hoy = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10); // America/La_Paz (UTC−4, sin horario de verano)
const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(fecha) + dias * 86_400_000).toISOString().slice(0, 10);

/** Token de descarga sin estado (D21): `base64url(exportacionId.sub.exp).base64url(HMAC-SHA256(secreto, payload))`. */
export function firmarDescarga(secreto: string, exportacionId: string, sub: string, expSegundos: number): string {
  const payload = Buffer.from(`${exportacionId}.${sub}.${expSegundos}`).toString('base64url');
  return `${payload}.${createHmac('sha256', secreto).update(payload).digest('base64url')}`;
}

export interface OpcionesResolvers {
  servicios: ClienteServicios;
  hmacSecreto: string;
  gatewayUrl: string;
}

export function crearResolvers({ servicios: s, hmacSecreto, gatewayUrl }: OpcionesResolvers) {
  const listarViajes = async (ctx: Ctx, estado: string | undefined, limite = 50) =>
    m.items(await s.get<Json>(ctx, 'viajes', '/api/v1/viajes', { query: { estado, limite: Math.min(limite, 100) } })).map(m.viaje);
  const viajeFresco = async (ctx: Ctx, id: string) => m.viaje(await s.get<Json>(ctx, 'viajes', `/api/v1/viajes/${id}`));
  const accion = (a: Json) => ({ ...a, evidencia: a['evidencia'] ?? [] });

  return {
    Fecha,
    Instante,
    Dinero,
    Cursor,
    JSON: JSONEscalar,

    Query: {
      yo: (_: unknown, __: Args, ctx: Ctx) => ({ sub: ctx.usuario.sub, nombre: ctx.usuario.nombre, roles: ctx.usuario.roles }),
      tablero: (_: unknown, { periodo }: Args) => ({ periodo }),

      viajesEnCurso: (_: unknown, { limite }: Args, ctx: Ctx) => listarViajes(ctx, 'EN_RUTA', limite),
      viajes: (_: unknown, { estado, limite }: Args, ctx: Ctx) => listarViajes(ctx, estado, limite),
      viaje: (_: unknown, { id }: Args, ctx: Ctx) => ctx.cargadores.viaje.load(id),
      entregasObservadas: (_: unknown, __: Args, ctx: Ctx) => listarViajes(ctx, 'ENTREGA_OBSERVADA'),
      intervenciones: (_: unknown, __: Args, ctx: Ctx) => listarViajes(ctx, 'REQUIERE_INTERVENCION'),
      servicios: async (_: unknown, { estado, clienteId, limite }: Args, ctx: Ctx) =>
        m
          .items(await s.get<Json>(ctx, 'viajes', '/api/v1/servicios', { query: { estado, clienteId, limite: Math.min(limite, 100) } }))
          .map(m.servicio),
      clientes: async (_: unknown, __: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'viajes', '/api/v1/clientes', { query: { limite: 100 } })),
      rutas: async (_: unknown, __: Args, ctx: Ctx) => m.items(await s.get<Json>(ctx, 'viajes', '/api/v1/rutas')).map(m.ruta),

      unidades: async (_: unknown, { tipo, estado, placa }: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'flota', '/api/v1/unidades', { query: { tipo, estado, placa, limite: 100 } })).map(m.unidad),
      unidad: async (_: unknown, { id }: Args, ctx: Ctx) => m.unidad(await s.get<Json>(ctx, 'flota', `/api/v1/unidades/${id}`)),
      mantenimientos: async (_: unknown, { estado, unidadId }: Args, ctx: Ctx) =>
        m
          .items(await s.get<Json>(ctx, 'flota', '/api/v1/mantenimientos', { query: { estado, unidadId, limite: 100 } }))
          .map(m.mantenimiento),
      choferes: async (_: unknown, __: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'flota', '/api/v1/choferes', { query: { limite: 100 } })),
      cargasCombustible: async (_: unknown, { placa, limite }: Args, ctx: Ctx) => {
        const tracto = placa ? await ctx.cargadores.unidadPorPlaca.load(placa) : null;
        if (placa && !tracto) return [];
        const r = await s.get<Json>(ctx, 'flota', '/api/v1/cargas-combustible', {
          query: { tractoId: tracto?.['unidadId'], limite: Math.min(limite, 100) },
        });
        return m.items(r).map(m.carga);
      },
      anomaliasCombustible: async (_: unknown, { desde, hasta }: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', '/api/v1/anomalias-combustible', { query: { desde, hasta, limite: 50 } }))['anomalias'],
      puntajesConduccion: (_: unknown, { desde, choferId }: Args, ctx: Ctx) =>
        s.get<Json>(ctx, 'analitica', '/api/v1/conduccion', { query: { desde, choferId } }),

      facturas: async (_: unknown, { clienteId, estado, conSaldo, limite }: Args, ctx: Ctx) =>
        m
          .items(
            await s.get<Json>(ctx, 'finanzas', '/api/v1/facturas', {
              query: { clienteId, estado, conSaldo, limite: Math.min(limite, 100) },
            }),
          )
          .map(m.factura),
      factura: async (_: unknown, { id }: Args, ctx: Ctx) => m.factura(await s.get<Json>(ctx, 'finanzas', `/api/v1/facturas/${id}`)),
      lineaCredito: (_: unknown, { clienteId }: Args, ctx: Ctx) => ctx.cargadores.lineaCredito.load(clienteId),
      cotizaciones: async (_: unknown, { clienteId, limite }: Args, ctx: Ctx) =>
        m
          .items(await s.get<Json>(ctx, 'finanzas', '/api/v1/cotizaciones', { query: { clienteId, limite: Math.min(limite, 100) } }))
          .map(m.cotizacion),
      solicitudesAprobacion: async (_: unknown, { estado }: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'finanzas', '/api/v1/solicitudes-aprobacion', { query: { estado, limite: 100 } })).map(m.solicitud),

      catalogoReportes: async (_: unknown, __: Args, ctx: Ctx) => (await s.get<Json>(ctx, 'analitica', '/api/v1/reportes'))['reportes'],
      reporte: (_: unknown, { id, params }: Args, ctx: Ctx) =>
        s.get<Json>(ctx, 'analitica', `/api/v1/reportes/${id}`, { query: params ?? {}, tiempoMs: ESPERA.mutacion }),
      alertasPendientes: (_: unknown, { desde, limite }: Args, ctx: Ctx) =>
        s.get<Json>(ctx, 'analitica', '/api/v1/alertas', { query: { cursor: desde, limite: Math.min(limite, 100) } }),
      misionesAgente: async (_: unknown, { limite }: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', '/api/v1/agente/misiones', { query: { limite } }))['misiones'],
      mision: (_: unknown, { id }: Args, ctx: Ctx) => s.get<Json>(ctx, 'analitica', `/api/v1/agente/misiones/${id}`),
      accionesPropuestas: async (_: unknown, { estado }: Args, ctx: Ctx) =>
        ((await s.get<Json>(ctx, 'analitica', '/api/v1/acciones', { query: { estado, limite: 100 } }))['acciones'] as Json[]).map(accion),
    },

    // Cada bloque del tablero resuelve por separado: si un servicio cae, solo su bloque sale en null (FR1, FR2).
    Tablero: {
      viajesEnCurso: (_: unknown, __: Args, ctx: Ctx) => listarViajes(ctx, 'EN_RUTA', 100),
      unidadesPorEstado: async (_: unknown, __: Args, ctx: Ctx) => {
        const unidades = m.items(await s.get<Json>(ctx, 'flota', '/api/v1/unidades', { query: { limite: 100 } }));
        const conteo = new Map<string, number>();
        for (const u of unidades) conteo.set(u['estado'], (conteo.get(u['estado']) ?? 0) + 1);
        return [...conteo].map(([estado, cantidad]) => ({ estado, cantidad }));
      },
      cuentasPorCobrar: async ({ periodo }: Json, __: Args, ctx: Ctx) => {
        const facturas = m
          .items(await s.get<Json>(ctx, 'finanzas', '/api/v1/facturas', { query: { conSaldo: true, limite: 100 } }))
          .map(m.factura);
        const dias = periodo === 'HOY' ? 0 : periodo === 'ESTA_SEMANA' ? 6 : 30;
        const limite = sumarDias(hoy(), dias);
        const porVencer = facturas.filter((f) => !f.vencida && f['venceEl'] <= limite);
        return {
          saldoTotal: m.sumar(facturas.map((f) => f.saldo)),
          facturasPorVencer: porVencer.length,
          facturasVencidas: facturas.filter((f) => f.vencida).length,
          proximas: [...porVencer].sort((a, b) => String(a['venceEl']).localeCompare(String(b['venceEl']))).slice(0, 5),
        };
      },
      alertasAbiertas: async (_: unknown, __: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', '/api/v1/alertas', { query: { estado: 'ABIERTA', limite: 1 } }))['abiertas'],
      datosAl: async (_: unknown, __: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', '/api/v1/alertas', { query: { estado: 'ABIERTA', limite: 1 } }))['datosAl'],
    },

    Viaje: {
      monto: async (v: Json, __: Args, ctx: Ctx) => (await ctx.cargadores.servicio.load(v['servicioId'])).monto,
      hitos: async (v: Json, { texto, limite }: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'viajes', `/api/v1/viajes/${v['viajeId']}/hitos`, { query: { texto, limite } })),
      entrega: (v: Json, __: Args, ctx: Ctx) =>
        s
          .get<Json>(ctx, 'viajes', `/api/v1/viajes/${v['viajeId']}/entrega`)
          .catch((e) => (e.extensions?.status === 404 ? null : Promise.reject(e))),
      riesgo: (v: Json, __: Args, ctx: Ctx) => (v['estado'] === 'EN_RUTA' ? ctx.cargadores.riesgo.load(v['viajeId']) : null),
      unidad: (v: Json, __: Args, ctx: Ctx) => (v['placa'] ? ctx.cargadores.unidadPorPlaca.load(v['placa']) : null),
    },
    Cliente: {
      lineaCredito: (c: Json, __: Args, ctx: Ctx) => ctx.cargadores.lineaCredito.load(c['clienteId']),
    },
    AccionPropuesta: {
      viaje: (a: Json, __: Args, ctx: Ctx) => ctx.cargadores.viaje.load(a['viajeId']),
    },

    Mutation: {
      cancelarServicio: async (_: unknown, { servicioId, motivo, claveIdempotencia }: Args, ctx: Ctx) => {
        await s.post(ctx, 'viajes', `/api/v1/servicios/${servicioId}/cancelacion`, { cuerpo: { motivo }, clave: claveIdempotencia });
        return m.servicio(await s.get<Json>(ctx, 'viajes', `/api/v1/servicios/${servicioId}`));
      },
      aprobarCredito: async (_: unknown, { servicioId, aprobado, motivo, claveIdempotencia }: Args, ctx: Ctx) => {
        await s.post(ctx, 'viajes', `/api/v1/servicios/${servicioId}/aprobacion-credito`, {
          cuerpo: { aprobado, ...(motivo ? { motivo } : {}) },
          clave: claveIdempotencia,
        });
        const servicio = await s.get<Json>(ctx, 'viajes', `/api/v1/servicios/${servicioId}`).then(m.servicio, () => null);
        return { servicioId, aprobado, servicio };
      },
      resolverIntervencion: async (_: unknown, { viajeId, opcion, nota, claveIdempotencia }: Args, ctx: Ctx) => {
        await s.post(ctx, 'viajes', `/api/v1/viajes/${viajeId}/intervencion`, {
          cuerpo: { opcion, ...(nota ? { nota } : {}) },
          clave: claveIdempotencia,
        });
        return viajeFresco(ctx, viajeId);
      },
      aprobarEntregaObservada: async (_: unknown, { viajeId, nota, claveIdempotencia }: Args, ctx: Ctx) => {
        await s.post(ctx, 'viajes', `/api/v1/viajes/${viajeId}/entrega/aprobacion`, {
          cuerpo: nota ? { nota } : {},
          clave: claveIdempotencia,
        });
        return viajeFresco(ctx, viajeId);
      },
      rechazarEntregaObservada: async (_: unknown, { viajeId, motivo, claveIdempotencia }: Args, ctx: Ctx) => {
        await s.post(ctx, 'viajes', `/api/v1/viajes/${viajeId}/entrega/rechazo`, { cuerpo: { motivo }, clave: claveIdempotencia });
        return viajeFresco(ctx, viajeId);
      },
      programarMantenimiento: async (_: unknown, { input }: Args, ctx: Ctx) => {
        const { unidadId, claveIdempotencia, checklist, ...resto } = input;
        const r = await s.post<Json>(ctx, 'flota', `/api/v1/unidades/${unidadId}/mantenimientos`, {
          cuerpo: { ...resto, checklist: checklist.map((item: string) => ({ item })) },
          clave: claveIdempotencia,
        });
        return m.mantenimiento(r);
      },
      cerrarMantenimiento: async (_: unknown, { input }: Args, ctx: Ctx) => {
        const { mantenimientoId, claveIdempotencia, ...cuerpo } = input;
        const r = await s.post<Json>(ctx, 'flota', `/api/v1/mantenimientos/${mantenimientoId}/cierre`, {
          cuerpo,
          clave: claveIdempotencia,
        });
        return m.mantenimiento(r);
      },
      registrarPago: async (_: unknown, { input }: Args, ctx: Ctx) => {
        const { facturaId, claveIdempotencia, monto, ...resto } = input;
        await s.post(ctx, 'finanzas', `/api/v1/facturas/${facturaId}/pagos`, {
          cuerpo: { ...resto, monto: { monto, moneda: 'BOB' } },
          clave: claveIdempotencia,
        });
        return m.factura(await s.get<Json>(ctx, 'finanzas', `/api/v1/facturas/${facturaId}`));
      },
      atenderAlerta: (_: unknown, { alertaId, nota, claveIdempotencia }: Args, ctx: Ctx) =>
        s.post<Json>(ctx, 'analitica', `/api/v1/alertas/${alertaId}/atencion`, { cuerpo: nota ? { nota } : {}, clave: claveIdempotencia }),
      dispararMision: (_: unknown, { claveIdempotencia }: Args, ctx: Ctx) =>
        s.post<Json>(ctx, 'analitica', '/api/v1/agente/misiones', { clave: claveIdempotencia }),
      aprobarAccion: async (_: unknown, { id, mensaje, claveIdempotencia }: Args, ctx: Ctx) =>
        accion(
          await s.post<Json>(ctx, 'analitica', `/api/v1/acciones/${id}/aprobacion`, { cuerpo: { mensaje }, clave: claveIdempotencia }),
        ),
      rechazarAccion: async (_: unknown, { id, motivo, claveIdempotencia }: Args, ctx: Ctx) =>
        accion(
          await s.post<Json>(ctx, 'analitica', `/api/v1/acciones/${id}/rechazo`, {
            cuerpo: motivo ? { motivo } : {},
            clave: claveIdempotencia,
          }),
        ),
      exportarReporte: async (_: unknown, { id, params, claveIdempotencia }: Args, ctx: Ctx) => {
        if (!hmacSecreto) throw errorGraphql('DEPENDENCIA_NO_DISPONIBLE', 'EXPORTACION_HMAC_SECRETO no está configurado', 503);
        const e = await s.post<Json>(ctx, 'analitica', '/api/v1/exportaciones', {
          cuerpo: { reporteId: id, parametros: params ?? {} },
          clave: claveIdempotencia,
          tiempoMs: ESPERA.exportar,
        });
        const exp = Math.floor(Date.parse(e['expiraEn']) / 1000);
        return {
          url: `${gatewayUrl}/exportaciones/${firmarDescarga(hmacSecreto, e['exportacionId'], ctx.usuario.sub, exp)}`,
          nombreArchivo: e['nombreArchivo'],
          expiraEn: e['expiraEn'],
        };
      },
      preguntar: (_: unknown, { texto }: Args, ctx: Ctx) =>
        s.post<Json>(ctx, 'analitica', '/api/v1/voz/preguntas', { cuerpo: { texto }, tiempoMs: ESPERA.preguntar }),
    },

    Subscription: {
      alertas: {
        subscribe: (_: unknown, __: Args, ctx: Ctx) => alertasNuevas(s, ctx),
        resolve: (alerta: Json) => alerta,
      },
    },
  };
}
