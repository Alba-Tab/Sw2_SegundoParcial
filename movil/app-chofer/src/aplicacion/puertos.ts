import type { PuntoGps } from '../dominio/gps';
import type { Operacion, TipoOperacion } from '../dominio/operacion';
import type { Respuesta } from '../dominio/reintento';
import type { ViajeLocal } from '../dominio/viaje';

/** Puertos de la app (Clean): la aplicación no conoce SQLite, fetch ni Expo. */

export interface Cola {
  todas(): Operacion[];
  agregar(op: Operacion): void;
  actualizar(op: Operacion): void;
  /** Las pendientes del viaje pasan a DESCARTADA (viaje cancelado sin señal, D54). */
  descartarViaje(viajeId: string, ahora: string): void;
  /** Borra las descartadas de más de 7 días. */
  purgar(antesDe: string): void;
}

export interface PuntosGps {
  agregar(p: PuntoGps): void;
  pendientes(viajeId: string, limite: number): PuntoGps[];
  viajes(): string[];
  borrar(viajeId: string, seqs: number[]): void;
  borrarHasta(viajeId: string, seq: number): void;
  contar(): number;
}

export interface Viajes {
  todos(): ViajeLocal[];
  porId(viajeId: string): ViajeLocal | null;
  /** Reemplaza lo que vino del servidor sin perder lo que el chofer hizo sin señal. */
  guardarDelServidor(viajes: ViajeLocal[]): void;
  marcarIniciado(viajeId: string): void;
  marcarCanceladoAlSincronizar(viajeId: string): void;
}

export interface Api {
  enviar(op: Operacion, token: string): Promise<Respuesta>;
  enviarLoteGps(viajeId: string, dispositivoId: string, puntos: PuntoGps[], loteId: string, token: string): Promise<Respuesta>;
  estadoDelViaje(viajeId: string, token: string): Promise<string | null>;
  misViajes(token: string): Promise<ViajeLocal[]>;
  cursor(dispositivoId: string, viajeId: string, token: string): Promise<number | null>;
  registrarDispositivo(dispositivoId: string, plataforma: 'ANDROID' | 'IOS', tokenPush: string | null, token: string): Promise<Respuesta>;
}

/** La sesión renueva el access token con el refresh token (offline_access, D27) antes de cada tanda. */
export interface Sesion {
  tokenVigente(): Promise<string>;
}

/** El refresh token ya no sirve (`invalid_grant`): hay que iniciar sesión otra vez, sin borrar la cola. */
export class SesionVencida extends Error {
  constructor() {
    super('La sesión venció; inicia sesión de nuevo');
    this.name = 'SesionVencida';
  }
}

/** Sin red para renovar el token: la cola espera. */
export class SinRed extends Error {
  constructor() {
    super('Sin conexión');
    this.name = 'SinRed';
  }
}

export interface Red {
  hayConexion(): Promise<boolean>;
}

export interface Reloj {
  ahora(): Date;
}

export interface Ids {
  nuevo(): string;
}

export interface Dispositivo {
  id(): string;
  plataforma(): 'ANDROID' | 'IOS';
}

export type NuevaOperacion = { viajeId: string; tipo: TipoOperacion; cuerpo: Record<string, unknown> };
