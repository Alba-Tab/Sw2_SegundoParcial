import type { Api } from '../aplicacion/puertos';
import type { PuntoGps } from '../dominio/gps';
import type { Operacion } from '../dominio/operacion';
import type { Respuesta } from '../dominio/reintento';
import type { ViajeLocal } from '../dominio/viaje';
import {
  type EventoConduccionNuevo,
  type HitoNuevo,
  iniciarViaje,
  type InicioViaje,
  listarMisViajes,
  obtenerCursorSincronizacion,
  obtenerViaje,
  registrarDispositivo,
  registrarEventoConduccion,
  registrarHito,
  registrarLoteGps,
  type Viaje,
} from './api/generado/viajes';

type Crudo = { data: unknown; status: number; headers: Headers };

/** Adaptador del puerto Api sobre los clientes generados por Orval (D49). */
export class ApiViajes implements Api {
  async enviar(op: Operacion, token: string): Promise<Respuesta> {
    const init = { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': op.opId } };
    switch (op.tipo) {
      case 'INICIO':
        return respuesta(() => iniciarViaje(op.viajeId, op.cuerpo as unknown as InicioViaje, init));
      case 'HITO':
        return respuesta(() => registrarHito(op.viajeId, op.cuerpo as unknown as HitoNuevo, init));
      case 'EVENTO_CONDUCCION':
        return respuesta(() => registrarEventoConduccion(op.viajeId, op.cuerpo as unknown as EventoConduccionNuevo, init));
      default:
        // Cargas y entregas llegan con T7.5 y T7.6.
        return { estado: 400, codigo: 'TIPO_NO_SOPORTADO' };
    }
  }

  enviarLoteGps(viajeId: string, dispositivoId: string, puntos: PuntoGps[], loteId: string, token: string): Promise<Respuesta> {
    return respuesta(() =>
      registrarLoteGps(
        viajeId,
        {
          dispositivoId,
          puntos: puntos.map((p) => ({
            seq: p.seq,
            registradaEn: p.registradaEn,
            lat: p.lat,
            lng: p.lng,
            velocidadKmh: p.velocidadKmh,
            ...(p.precisionMetros !== null ? { precisionMetros: p.precisionMetros } : {}),
          })),
        },
        { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': loteId } },
      ),
    );
  }

  async estadoDelViaje(viajeId: string, token: string): Promise<string | null> {
    const r = (await obtenerViaje(viajeId, { headers: { Authorization: `Bearer ${token}` } })) as Crudo;
    return r.status === 200 ? (r.data as Viaje).estado : null;
  }

  async misViajes(token: string): Promise<ViajeLocal[]> {
    const r = (await listarMisViajes({ headers: { Authorization: `Bearer ${token}` } })) as Crudo;
    if (r.status !== 200) throw new Error(`GET /viajes/mios respondió ${r.status}`);
    return (r.data as { items: Viaje[] }).items.map(aLocal);
  }

  async cursor(dispositivoId: string, viajeId: string, token: string): Promise<number | null> {
    const r = (await obtenerCursorSincronizacion(dispositivoId, { viajeId }, { headers: { Authorization: `Bearer ${token}` } })) as Crudo;
    return r.status === 200 ? ((r.data as { ultimaSecuencia: number | null }).ultimaSecuencia ?? null) : null;
  }

  registrarDispositivo(dispositivoId: string, plataforma: 'ANDROID' | 'IOS', tokenPush: string | null, token: string): Promise<Respuesta> {
    return respuesta(() =>
      registrarDispositivo(
        { dispositivoId, plataforma, ...(tokenPush ? { tokenPush } : {}) },
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
  }
}

/** Convierte la respuesta cruda en la del dominio; si la petición no llegó (o pasó 15 s), SIN_RED. */
async function respuesta(llamar: () => Promise<unknown>): Promise<Respuesta> {
  try {
    const r = (await llamar()) as Crudo;
    const problema = r.status >= 400 ? (r.data as { codigo?: string } | undefined) : undefined;
    const reintentar = Number(r.headers.get('Retry-After'));
    return {
      estado: r.status,
      cuerpo: r.data,
      ...(problema?.codigo ? { codigo: problema.codigo } : {}),
      ...(reintentar > 0 ? { reintentarEnSegundos: reintentar } : {}),
    };
  } catch {
    return { estado: 'SIN_RED' };
  }
}

function aLocal(v: Viaje): ViajeLocal {
  return {
    viajeId: v.viajeId,
    estado: v.estado,
    iniciadoLocal: false,
    canceladoAlSincronizar: false,
    cliente: v.cliente.razonSocial,
    ruta: v.ruta.nombre,
    destino: { lat: v.ruta.destino.coordenadas.lat, lng: v.ruta.destino.coordenadas.lng, radioMetros: v.ruta.destino.radioMetros },
    tipoCarga: v.tipoCarga,
    toneladas: v.toneladas,
    fechaViaje: v.fechaViaje,
    placa: v.placa,
  };
}
