import { createHmac } from 'node:crypto';
import { GraphQLError, responsePathAsArray, type GraphQLResolveInfo } from 'graphql';
import type { Contexto } from '../autenticacion';
import { errorGraphql, validacion } from '../errores';
import { registrar, traceIdDe } from '../log';
import { ESPERA, noDisponible, rutaRest, type ClienteServicios, type Llamada, type RutaRest, type Servicio } from '../servicios';
import type { Cargadores } from './cargadores';
import { Cursor, Dinero, Fecha, Instante, JSONEscalar } from './escalares';
import { LIMITE_MAXIMO } from './limites';
import * as m from './mapeos';
import { alertasNuevas } from './suscripcion';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = Contexto & { cargadores: Cargadores };
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const hoy = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10); // America/La_Paz (UTC−4, sin horario de verano)
const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(fecha) + dias * 86_400_000).toISOString().slice(0, 10);
const finDeMes = (fecha: string) => {
  const d = new Date(Date.parse(fecha));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

/**
 * Vencimientos "por vencer" del periodo del tablero, con los periodos de la spec 015 para cuentas por cobrar (hacia
 * adelante, con hoy incluido): HOY, ESTA_SEMANA (7 días) y ESTE_MES (hasta fin de mes). El Gateway solo traduce el
 * periodo a fechas; Finanzas cuenta y suma.
 */
export function ventanaPorVencer(periodo: string, desde = hoy()): { venceDesde: string; venceHasta: string } {
  const venceHasta = periodo === 'HOY' ? desde : periodo === 'ESTA_SEMANA' ? sumarDias(desde, 6) : finDeMes(desde);
  return { venceDesde: desde, venceHasta };
}

/** `limite` de 1 a 100 (000 §4); sin valor o `null`, el valor por defecto del campo. Fuera de rango → VALIDACION. */
export function limiteValido(valor: unknown, porDefecto: number): number {
  if (valor === null || valor === undefined) return porDefecto;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > LIMITE_MAXIMO) {
    throw validacion(`limite debe estar entre 1 y ${LIMITE_MAXIMO}`, {
      errores: [{ campo: 'limite', mensaje: `Debe estar entre 1 y ${LIMITE_MAXIMO}` }],
    });
  }
  return valor;
}

/** Páginas de 100 que se piden para un resumen; más que eso no se resume en el Gateway. */
export const MAX_PAGINAS = 20;

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
  const listarViajes = async (ctx: Ctx, estado: string | undefined, limite: number) =>
    m.items(await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes`, { query: { estado, limite } })).map(m.viaje);
  const accion = (a: Json) => ({ ...a, evidencia: a['evidencia'] ?? [] });

  /**
   * Todas las páginas de una lista (cursor hasta agotar), para los resúmenes del tablero. El conjunto tarda como máximo
   * lo que una llamada al componer (3 s, D98): si no alcanza, el bloque sale en null con DEPENDENCIA_NO_DISPONIBLE.
   */
  async function todas(ctx: Ctx, servicio: Servicio, ruta: RutaRest, query: Llamada['query'] = {}): Promise<Json[]> {
    const fin = Date.now() + ESPERA.consulta;
    const elementos: Json[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const restante = fin - Date.now();
      if (restante <= 0) throw noDisponible(servicio, `no respondió en ${ESPERA.consulta / 1000} s`);
      const r = await s.get<Json>(ctx, servicio, ruta, { query: { ...query, limite: LIMITE_MAXIMO, cursor }, tiempoMs: restante });
      elementos.push(...m.items(r));
      cursor = r?.['siguienteCursor'] ?? undefined;
      if (!cursor) return elementos;
    }
    throw errorGraphql(
      'CONSULTA_DEMASIADO_COMPLEJA',
      `Hay más de ${MAX_PAGINAS * LIMITE_MAXIMO} registros para resumir; usa el reporte correspondiente`,
      400,
      { servicio },
    );
  }

  /**
   * Las mutaciones que no devuelven el recurso (202) lo releen. Si la escritura ya se aplicó y la relectura falla, no
   * es un error de la mutación: el campo sale en null y la respuesta trae un aviso en `extensions.avisos`.
   */
  async function releerOAvisar<T>(ctx: Ctx, info: GraphQLResolveInfo, releer: () => Promise<T>, mensaje: string): Promise<T | null> {
    try {
      return await releer();
    } catch (e) {
      const ext = e instanceof GraphQLError ? e.extensions : {};
      const aviso = {
        mensaje,
        codigo: typeof ext['codigo'] === 'string' ? ext['codigo'] : 'ERROR_INTERNO',
        ...(typeof ext['servicio'] === 'string' ? { servicio: ext['servicio'] } : {}),
        path: responsePathAsArray(info.path),
      };
      (ctx.avisos ??= []).push(aviso);
      registrar('WARN', mensaje, { correlationId: ctx.correlationId, traceId: traceIdDe(ctx.traceparent), aviso });
      return null;
    }
  }

  /** El POST ya devuelve el recurso (contrato); solo si vino vacío se relee. */
  const oReleer = async (r: Json | undefined, releer: () => Promise<Json>) => (r && Object.keys(r).length ? r : releer());

  return {
    Fecha,
    Instante,
    Dinero,
    Cursor,
    JSON: JSONEscalar,

    Query: {
      yo: (_: unknown, __: Args, ctx: Ctx) => ({ sub: ctx.usuario.sub, nombre: ctx.usuario.nombre, roles: ctx.usuario.roles }),
      // Las alertas abiertas y `datosAl` salen de la misma llamada: se pide una vez por tablero.
      tablero: (_: unknown, { periodo }: Args, ctx: Ctx) => {
        let alertas: Promise<Json> | undefined;
        const resumenAlertas = () =>
          (alertas ??= s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/alertas`, { query: { estado: 'ABIERTA', limite: 1 } }));
        return { periodo, resumenAlertas };
      },

      viajesEnCurso: (_: unknown, { limite }: Args, ctx: Ctx) => listarViajes(ctx, 'EN_RUTA', limiteValido(limite, 50)),
      viajes: (_: unknown, { estado, limite }: Args, ctx: Ctx) => listarViajes(ctx, estado, limiteValido(limite, 50)),
      viaje: (_: unknown, { id }: Args, ctx: Ctx) => ctx.cargadores.viaje.load(id),
      entregasObservadas: (_: unknown, __: Args, ctx: Ctx) => listarViajes(ctx, 'ENTREGA_OBSERVADA', 50),
      intervenciones: (_: unknown, __: Args, ctx: Ctx) => listarViajes(ctx, 'REQUIERE_INTERVENCION', 50),
      servicios: async (_: unknown, { estado, clienteId, limite }: Args, ctx: Ctx) =>
        m
          .items(
            await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/servicios`, {
              query: { estado, clienteId, limite: limiteValido(limite, 50) },
            }),
          )
          .map(m.servicio),
      clientes: async (_: unknown, __: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/clientes`, { query: { limite: LIMITE_MAXIMO } })),
      // listarRutas devuelve un arreglo plano, no una página (contratos/openapi/viajes.yaml).
      rutas: async (_: unknown, __: Args, ctx: Ctx) => m.items(await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/rutas`)).map(m.ruta),

      unidades: async (_: unknown, { tipo, estado, placa }: Args, ctx: Ctx) =>
        m
          .items(await s.get<Json>(ctx, 'flota', rutaRest`/api/v1/unidades`, { query: { tipo, estado, placa, limite: LIMITE_MAXIMO } }))
          .map(m.unidad),
      unidad: async (_: unknown, { id }: Args, ctx: Ctx) => m.unidad(await s.get<Json>(ctx, 'flota', rutaRest`/api/v1/unidades/${id}`)),
      mantenimientos: async (_: unknown, { estado, unidadId }: Args, ctx: Ctx) =>
        m
          .items(await s.get<Json>(ctx, 'flota', rutaRest`/api/v1/mantenimientos`, { query: { estado, unidadId, limite: LIMITE_MAXIMO } }))
          .map(m.mantenimiento),
      choferes: async (_: unknown, __: Args, ctx: Ctx) =>
        m.items(await s.get<Json>(ctx, 'flota', rutaRest`/api/v1/choferes`, { query: { limite: LIMITE_MAXIMO } })),
      cargasCombustible: async (_: unknown, { placa, limite }: Args, ctx: Ctx) => {
        const n = limiteValido(limite, 50);
        const tracto = placa ? await ctx.cargadores.unidadPorPlaca.load(placa) : null;
        if (placa && !tracto) return [];
        const r = await s.get<Json>(ctx, 'flota', rutaRest`/api/v1/cargas-combustible`, {
          query: { tractoId: tracto?.['unidadId'], limite: n },
        });
        return m.items(r).map(m.carga);
      },
      anomaliasCombustible: async (_: unknown, { desde, hasta }: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/anomalias-combustible`, { query: { desde, hasta, limite: 50 } }))[
          'anomalias'
        ],
      puntajesConduccion: (_: unknown, { desde, choferId }: Args, ctx: Ctx) =>
        s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/conduccion`, { query: { desde, choferId } }),

      facturas: async (_: unknown, { clienteId, estado, conSaldo, limite }: Args, ctx: Ctx) =>
        m
          .items(
            await s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/facturas`, {
              query: { clienteId, estado, conSaldo, limite: limiteValido(limite, 50) },
            }),
          )
          .map(m.factura),
      factura: async (_: unknown, { id }: Args, ctx: Ctx) =>
        m.factura(await s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/facturas/${id}`)),
      lineaCredito: (_: unknown, { clienteId }: Args, ctx: Ctx) => ctx.cargadores.lineaCredito.load(clienteId),
      cotizaciones: async (_: unknown, { clienteId, limite }: Args, ctx: Ctx) =>
        m
          .items(
            await s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/cotizaciones`, {
              query: { clienteId, limite: limiteValido(limite, 50) },
            }),
          )
          .map(m.cotizacion),
      solicitudesAprobacion: async (_: unknown, { estado }: Args, ctx: Ctx) =>
        m
          .items(await s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/solicitudes-aprobacion`, { query: { estado, limite: LIMITE_MAXIMO } }))
          .map(m.solicitud),

      catalogoReportes: async (_: unknown, __: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/reportes`))['reportes'],
      reporte: (_: unknown, { id, params }: Args, ctx: Ctx) =>
        s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/reportes/${id}`, { query: params ?? {}, tiempoMs: ESPERA.mutacion }),
      alertasPendientes: (_: unknown, { desde, limite }: Args, ctx: Ctx) =>
        s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/alertas`, { query: { cursor: desde, limite: limiteValido(limite, 50) } }),
      misionesAgente: async (_: unknown, { limite }: Args, ctx: Ctx) =>
        (await s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/agente/misiones`, { query: { limite: limiteValido(limite, 20) } }))[
          'misiones'
        ],
      mision: (_: unknown, { id }: Args, ctx: Ctx) => s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/agente/misiones/${id}`),
      accionesPropuestas: async (_: unknown, { estado }: Args, ctx: Ctx) =>
        (
          (await s.get<Json>(ctx, 'analitica', rutaRest`/api/v1/acciones`, { query: { estado, limite: LIMITE_MAXIMO } }))[
            'acciones'
          ] as Json[]
        ).map(accion),
    },

    // Cada bloque del tablero resuelve por separado: si un servicio cae, solo su bloque sale en null (FR1, FR2). Los
    // conteos y saldos salen de todas las páginas, no de las primeras 100.
    Tablero: {
      viajesEnCurso: (_: unknown, __: Args, ctx: Ctx) => listarViajes(ctx, 'EN_RUTA', LIMITE_MAXIMO),
      unidadesPorEstado: async (_: unknown, __: Args, ctx: Ctx) => {
        const conteo = new Map<string, number>();
        for (const u of await todas(ctx, 'flota', rutaRest`/api/v1/unidades`)) conteo.set(u['estado'], (conteo.get(u['estado']) ?? 0) + 1);
        return [...conteo].map(([estado, cantidad]) => ({ estado, cantidad }));
      },
      // Finanzas calcula el resumen (saldo, vencidas, por vencer y las 5 próximas); el Gateway solo lo traduce.
      cuentasPorCobrar: async ({ periodo }: Json, __: Args, ctx: Ctx) => {
        const r = await s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/facturas/resumen`, { query: ventanaPorVencer(periodo) });
        return { ...r, saldoTotal: m.dinero(r['saldoTotal']), proximas: (r['proximas'] ?? []).map(m.factura) };
      },
      alertasAbiertas: async (t: { resumenAlertas: () => Promise<Json> }) => (await t.resumenAlertas())['abiertas'],
      datosAl: async (t: { resumenAlertas: () => Promise<Json> }) => (await t.resumenAlertas())['datosAl'],
    },

    Viaje: {
      monto: async (v: Json, __: Args, ctx: Ctx) => (await ctx.cargadores.servicio.load(v['servicioId'])).monto,
      // Por DataLoader: en una lista de viajes, como máximo 10 llamadas a la vez (D97). listarHitos no pagina: el
      // `limite` del esquema recorta la bitácora, que viene de la más nueva a la más vieja.
      hitos: async (v: Json, { texto, limite }: Args, ctx: Ctx) => {
        const n = limiteValido(limite, 20);
        return (await ctx.cargadores.hitos.load(JSON.stringify([v['viajeId'], texto ?? null]))).slice(0, n);
      },
      entrega: (v: Json, __: Args, ctx: Ctx) => ctx.cargadores.entrega.load(v['viajeId']),
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
        const r = await s.post<Json>(ctx, 'viajes', rutaRest`/api/v1/servicios/${servicioId}/cancelacion`, {
          cuerpo: { motivo },
          clave: claveIdempotencia,
        });
        return m.servicio(await oReleer(r, () => s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/servicios/${servicioId}`)));
      },
      aprobarCredito: async (_: unknown, { servicioId, aprobado, motivo, claveIdempotencia }: Args, ctx: Ctx, info: GraphQLResolveInfo) => {
        await s.post(ctx, 'viajes', rutaRest`/api/v1/servicios/${servicioId}/aprobacion-credito`, {
          cuerpo: { aprobado, ...(motivo ? { motivo } : {}) },
          clave: claveIdempotencia,
        });
        const servicio = await releerOAvisar(
          ctx,
          info,
          () => s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/servicios/${servicioId}`).then(m.servicio),
          'La decisión se registró, pero no se pudo leer el servicio actualizado',
        );
        return { servicioId, aprobado, servicio };
      },
      resolverIntervencion: async (_: unknown, { viajeId, opcion, nota, claveIdempotencia }: Args, ctx: Ctx, info: GraphQLResolveInfo) => {
        await s.post(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}/intervencion`, {
          cuerpo: { opcion, ...(nota ? { nota } : {}) },
          clave: claveIdempotencia,
        });
        return releerOAvisar(
          ctx,
          info,
          async () => m.viaje(await s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}`)),
          'La intervención se registró, pero no se pudo leer el viaje actualizado',
        );
      },
      aprobarEntregaObservada: async (_: unknown, { viajeId, nota, claveIdempotencia }: Args, ctx: Ctx) => {
        const r = await s.post<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}/entrega/aprobacion`, {
          cuerpo: nota ? { nota } : {},
          clave: claveIdempotencia,
        });
        return m.viaje(await oReleer(r, () => s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}`)));
      },
      rechazarEntregaObservada: async (_: unknown, { viajeId, motivo, claveIdempotencia }: Args, ctx: Ctx) => {
        const r = await s.post<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}/entrega/rechazo`, {
          cuerpo: { motivo },
          clave: claveIdempotencia,
        });
        return m.viaje(await oReleer(r, () => s.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}`)));
      },
      programarMantenimiento: async (_: unknown, { input }: Args, ctx: Ctx) => {
        const { unidadId, claveIdempotencia, checklist, ...resto } = input;
        const r = await s.post<Json>(ctx, 'flota', rutaRest`/api/v1/unidades/${unidadId}/mantenimientos`, {
          cuerpo: { ...resto, checklist: checklist.map((item: string) => ({ item })) },
          clave: claveIdempotencia,
        });
        return m.mantenimiento(r);
      },
      cerrarMantenimiento: async (_: unknown, { input }: Args, ctx: Ctx) => {
        const { mantenimientoId, claveIdempotencia, ...cuerpo } = input;
        const r = await s.post<Json>(ctx, 'flota', rutaRest`/api/v1/mantenimientos/${mantenimientoId}/cierre`, {
          cuerpo,
          clave: claveIdempotencia,
        });
        return m.mantenimiento(r);
      },
      registrarPago: async (_: unknown, { input }: Args, ctx: Ctx) => {
        const { facturaId, claveIdempotencia, monto, ...resto } = input;
        // registrarPago responde 201 con la factura actualizada (contratos/openapi/finanzas.yaml).
        const r = await s.post<Json>(ctx, 'finanzas', rutaRest`/api/v1/facturas/${facturaId}/pagos`, {
          cuerpo: { ...resto, monto: { monto, moneda: 'BOB' } },
          clave: claveIdempotencia,
        });
        return m.factura(await oReleer(r, () => s.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/facturas/${facturaId}`)));
      },
      atenderAlerta: (_: unknown, { alertaId, nota, claveIdempotencia }: Args, ctx: Ctx) =>
        s.post<Json>(ctx, 'analitica', rutaRest`/api/v1/alertas/${alertaId}/atencion`, {
          cuerpo: nota ? { nota } : {},
          clave: claveIdempotencia,
        }),
      dispararMision: (_: unknown, { claveIdempotencia }: Args, ctx: Ctx) =>
        s.post<Json>(ctx, 'analitica', rutaRest`/api/v1/agente/misiones`, { clave: claveIdempotencia }),
      aprobarAccion: async (_: unknown, { id, mensaje, claveIdempotencia }: Args, ctx: Ctx) =>
        accion(
          await s.post<Json>(ctx, 'analitica', rutaRest`/api/v1/acciones/${id}/aprobacion`, {
            cuerpo: { mensaje },
            clave: claveIdempotencia,
          }),
        ),
      rechazarAccion: async (_: unknown, { id, motivo, claveIdempotencia }: Args, ctx: Ctx) =>
        accion(
          await s.post<Json>(ctx, 'analitica', rutaRest`/api/v1/acciones/${id}/rechazo`, {
            cuerpo: motivo ? { motivo } : {},
            clave: claveIdempotencia,
          }),
        ),
      exportarReporte: async (_: unknown, { id, params, claveIdempotencia }: Args, ctx: Ctx) => {
        if (!hmacSecreto) throw errorGraphql('DEPENDENCIA_NO_DISPONIBLE', 'EXPORTACION_HMAC_SECRETO no está configurado', 503);
        const e = await s.post<Json>(ctx, 'analitica', rutaRest`/api/v1/exportaciones`, {
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
        s.post<Json>(ctx, 'analitica', rutaRest`/api/v1/voz/preguntas`, { cuerpo: { texto }, tiempoMs: ESPERA.preguntar }),
    },

    Subscription: {
      alertas: {
        subscribe: (_: unknown, __: Args, ctx: Ctx) => alertasNuevas(s, ctx),
        resolve: (alerta: Json) => alerta,
      },
    },
  };
}
