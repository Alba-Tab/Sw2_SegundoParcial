import { PUNTOS_POR_LOTE } from '../dominio/gps';
import { inicioConfirmado, type Operacion, RETENCION_DESCARTADAS_MS, siguiente } from '../dominio/operacion';
import { decidir } from '../dominio/reintento';
import {
  type Api,
  type Cola,
  type Dispositivo,
  type Ids,
  type PuntosGps,
  type Red,
  type Reloj,
  type Sesion,
  SesionVencida,
  SinRed,
  type Viajes,
} from './puertos';

export interface Resumen {
  sinConexion: boolean;
  requiereSesion: boolean;
  confirmadas: number;
  puntosEnviados: number;
  /** Viajes cancelados mientras el chofer registraba sin señal (plan F7). */
  cancelados: string[];
}

/**
 * Motor de sincronización (spec 005, CU-08). Una tanda a la vez: renueva el token, envía la cola de cada viaje en orden
 * (una petición a la vez por viaje) y después los lotes de GPS de los viajes con el inicio confirmado (un lote a la vez).
 * Los reintentos esperan con *full jitter*; un 409 CONFLICTO_ESTADO con el viaje cancelado descarta su cola y avisa.
 */
export class MotorSincronizacion {
  private corriendo: Promise<Resumen> | null = null;
  /** Hasta cuándo espera el GPS de cada viaje después de un 503 o de un corte (Retry-After o jitter). */
  private esperaGps = new Map<string, { hasta: number; intentos: number }>();

  constructor(
    private readonly cola: Cola,
    private readonly puntos: PuntosGps,
    private readonly viajes: Viajes,
    private readonly api: Api,
    private readonly sesion: Sesion,
    private readonly red: Red,
    private readonly reloj: Reloj,
    private readonly ids: Ids,
    private readonly dispositivo: Dispositivo,
    private readonly azar: () => number = Math.random,
  ) {}

  /** Si ya hay una tanda en curso, devuelve esa (los disparadores pueden coincidir). */
  sincronizar(): Promise<Resumen> {
    this.corriendo ??= this.tanda().finally(() => (this.corriendo = null));
    return this.corriendo;
  }

  private async tanda(): Promise<Resumen> {
    const r: Resumen = { sinConexion: false, requiereSesion: false, confirmadas: 0, puntosEnviados: 0, cancelados: [] };
    this.cola.purgar(new Date(this.reloj.ahora().getTime() - RETENCION_DESCARTADAS_MS).toISOString());
    if (!(await this.red.hayConexion())) return { ...r, sinConexion: true };
    let token: string;
    try {
      token = await this.sesion.tokenVigente();
    } catch (e) {
      if (e instanceof SesionVencida) return { ...r, requiereSesion: true };
      if (e instanceof SinRed) return { ...r, sinConexion: true };
      throw e;
    }

    const porViaje = new Map<string, Operacion[]>();
    for (const op of this.cola.todas()) porViaje.set(op.viajeId, [...(porViaje.get(op.viajeId) ?? []), op]);
    for (const [viajeId, ops] of porViaje) {
      const fin = await this.enviarCola(viajeId, ops, token, r);
      if (fin === 'SESION') return { ...r, requiereSesion: true };
    }
    for (const viajeId of this.puntos.viajes()) {
      if (!inicioConfirmado(porViaje.get(viajeId) ?? [])) continue;
      const fin = await this.enviarGps(viajeId, token, r);
      if (fin === 'SESION') return { ...r, requiereSesion: true };
    }
    return r;
  }

  private async enviarCola(viajeId: string, ops: Operacion[], token: string, r: Resumen): Promise<'SESION' | void> {
    for (;;) {
      const ahora = this.reloj.ahora();
      const op = siguiente(ops, ahora);
      if (!op) return;
      const d = decidir(await this.api.enviar(op, token), op.intentos + 1, this.azar);
      if (d.tipo === 'SESION') return 'SESION';
      if (d.tipo === 'CONFIRMADA') {
        this.cerrar(op, 'CONFIRMADA', null);
        r.confirmadas++;
        continue;
      }
      if (d.tipo === 'REINTENTAR') {
        op.intentos++;
        op.proximoIntentoEn = new Date(ahora.getTime() + d.esperaMs).toISOString();
        this.cola.actualizar(op);
        return;
      }
      if (d.tipo === 'CONFLICTO' && (await this.api.estadoDelViaje(viajeId, token)) === 'CANCELADO') {
        // Plan F7: "Viaje cancelado; llama al despachador". El resto de su cola no se envía (queda 7 días en Descartadas).
        this.cola.descartarViaje(viajeId, ahora.toISOString());
        for (const o of ops) if (o.estado === 'PENDIENTE') o.estado = 'DESCARTADA';
        this.viajes.marcarCanceladoAlSincronizar(viajeId);
        r.cancelados.push(viajeId);
        return;
      }
      this.cerrar(op, 'FALLIDA', d.tipo === 'FALLIDA' ? d.codigo : 'CONFLICTO_ESTADO');
    }
  }

  private async enviarGps(viajeId: string, token: string, r: Resumen): Promise<'SESION' | void> {
    const espera = this.esperaGps.get(viajeId);
    if (espera && espera.hasta > this.reloj.ahora().getTime()) return;
    for (;;) {
      const lote = this.puntos.pendientes(viajeId, PUNTOS_POR_LOTE);
      if (lote.length === 0) return;
      const intentos = (this.esperaGps.get(viajeId)?.intentos ?? 0) + 1;
      const respuesta = await this.api.enviarLoteGps(viajeId, this.dispositivo.id(), lote, this.ids.nuevo(), token);
      const d = decidir(respuesta, intentos, this.azar);
      if (d.tipo === 'SESION') return 'SESION';
      if (d.tipo === 'REINTENTAR') {
        // *Throttling* de DynamoDB (FO4) o corte: no es un error del chofer; solo crece "Pendientes".
        this.esperaGps.set(viajeId, { hasta: this.reloj.ahora().getTime() + d.esperaMs, intentos });
        return;
      }
      this.esperaGps.delete(viajeId);
      // Aceptado, o rechazado sin arreglo posible (400, o 409 de un viaje cancelado): esos puntos no se reintentan.
      this.puntos.borrar(
        viajeId,
        lote.map((p) => p.seq),
      );
      if (d.tipo === 'CONFIRMADA') r.puntosEnviados += lote.length;
    }
  }

  private cerrar(op: Operacion, estado: 'CONFIRMADA' | 'FALLIDA', codigo: string | null) {
    op.estado = estado;
    op.codigoError = codigo;
    op.cerradaEn = this.reloj.ahora().toISOString();
    this.cola.actualizar(op);
  }

  /**
   * Al abrir la app: lo que el servidor ya aceptó (si la app se cerró antes de recibir la respuesta del lote) se borra
   * de SQLite con el cursor del dispositivo (D55).
   */
  async recuperarCursor(): Promise<void> {
    if (!(await this.red.hayConexion())) return;
    try {
      const token = await this.sesion.tokenVigente();
      for (const viajeId of this.puntos.viajes()) {
        const seq = await this.api.cursor(this.dispositivo.id(), viajeId, token);
        if (seq !== null) this.puntos.borrarHasta(viajeId, seq);
      }
    } catch (e) {
      if (!(e instanceof SesionVencida || e instanceof SinRed)) throw e;
    }
  }
}
