import { kmh, type Lectura, MuestreoGps } from '../dominio/muestreo';
import type { TipoOperacion } from '../dominio/operacion';
import { puedeIniciar } from '../dominio/viaje';
import type { Api, Cola, Dispositivo, Ids, PuntosGps, Reloj, Sesion, Viajes } from './puertos';

/** Lo que hace el chofer. Las escrituras van primero a la cola local; el motor las envía cuando hay señal. */
export class CasosDeUso {
  private readonly muestreos = new Map<string, MuestreoGps>();
  private ultima: Lectura | null = null;

  constructor(
    private readonly cola: Cola,
    private readonly puntos: PuntosGps,
    private readonly viajes: Viajes,
    private readonly api: Api,
    private readonly sesion: Sesion,
    private readonly reloj: Reloj,
    private readonly ids: Ids,
    private readonly dispositivo: Dispositivo,
  ) {}

  /** Paso 1 (con señal): `GET /viajes/mios` a SQLite para operar sin red. */
  async descargarViajes(): Promise<void> {
    this.viajes.guardarDelServidor(await this.api.misViajes(await this.sesion.tokenVigente()));
  }

  /** Paso 2: el `opId` y la hora salen del celular al pulsar, no al enviar (FO1). */
  iniciarViaje(viajeId: string, posicion: { lat: number; lng: number } | null): string {
    const v = this.viajes.porId(viajeId);
    if (!v || !puedeIniciar(v, this.viajes.todos())) throw new Error('Este viaje no se puede iniciar ahora');
    const opId = this.encolar(viajeId, 'INICIO', {
      dispositivoId: this.dispositivo.id(),
      iniciadoEn: this.reloj.ahora().toISOString(),
      ...(posicion ? { posicion } : {}),
    });
    this.viajes.marcarIniciado(viajeId);
    return opId;
  }

  /** Spec 005, paso 4: cada lectura del GPS; se guarda solo si pasa el muestreo de D52. */
  registrarLectura(viajeId: string, l: Lectura): boolean {
    this.ultima = l;
    const muestreo = this.muestreos.get(viajeId) ?? new MuestreoGps();
    this.muestreos.set(viajeId, muestreo);
    if (!muestreo.aceptar(l)) return false;
    this.puntos.agregar({
      viajeId,
      seq: this.puntos.siguienteSeq(viajeId),
      registradaEn: new Date(l.en).toISOString(),
      lat: l.lat,
      lng: l.lng,
      velocidadKmh: kmh(l.velocidadMs),
      precisionMetros: l.precisionMetros,
    });
    return true;
  }

  ultimaPosicion(): { lat: number; lng: number } | null {
    return this.ultima ? { lat: this.ultima.lat, lng: this.ultima.lng } : null;
  }

  velocidadKmh(): number {
    return this.ultima ? kmh(this.ultima.velocidadMs) : 0;
  }

  /** Spec 005, paso 8: la frenada detectada en el celular (D08) va a la cola con la última posición del GPS. */
  registrarFrenada(viajeId: string, magnitudG: number): string | null {
    const posicion = this.ultimaPosicion();
    if (!posicion) return null;
    return this.encolar(viajeId, 'EVENTO_CONDUCCION', {
      eventoId: this.ids.nuevo(),
      tipo: 'FRENADA_BRUSCA',
      magnitudG,
      posicion,
      registradoEn: this.reloj.ahora().toISOString(),
    });
  }

  /** Hitos, eventos de conducción, cargas y entregas usan la misma cola (T7.3 a T7.6). */
  encolar(viajeId: string, tipo: TipoOperacion, cuerpo: Record<string, unknown>): string {
    const opId = this.ids.nuevo();
    this.cola.agregar({
      opId,
      viajeId,
      tipo,
      cuerpo,
      creadaEn: this.reloj.ahora().toISOString(),
      intentos: 0,
      proximoIntentoEn: null,
      estado: 'PENDIENTE',
      codigoError: null,
      cerradaEn: null,
    });
    return opId;
  }

  /** `PUT /dispositivos/mio` después de iniciar sesión (spec 005); el token push lo agrega T7.8. */
  async registrarDispositivo(tokenPush: string | null = null): Promise<void> {
    await this.api.registrarDispositivo(this.dispositivo.id(), this.dispositivo.plataforma(), tokenPush, await this.sesion.tokenVigente());
  }
}
