import type { TipoOperacion } from '../dominio/operacion';
import { puedeIniciar } from '../dominio/viaje';
import type { Api, Cola, Dispositivo, Ids, Reloj, Sesion, Viajes } from './puertos';

/** Lo que hace el chofer. Las escrituras van primero a la cola local; el motor las envía cuando hay señal. */
export class CasosDeUso {
  constructor(
    private readonly cola: Cola,
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
