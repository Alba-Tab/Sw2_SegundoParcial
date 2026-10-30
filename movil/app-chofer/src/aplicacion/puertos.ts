import type { EvidenciaLocal, Parte } from '../dominio/evidencia';
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
  /** El siguiente `seq` del viaje en este celular (crece aunque los puntos ya enviados se borren). */
  siguienteSeq(viajeId: string): number;
  pendientes(viajeId: string, limite: number): PuntoGps[];
  viajes(): string[];
  borrar(viajeId: string, seqs: number[]): void;
  borrarHasta(viajeId: string, seq: number): void;
  contar(): number;
}

export interface Viajes {
  todos(): ViajeLocal[];
  porId(viajeId: string): ViajeLocal | null;
  /**
   * Reemplaza lo que vino del servidor sin perder lo que el chofer hizo sin señal. Los viajes que ya no vienen se
   * borran, salvo los que tienen operaciones pendientes (`viajesQueSobran`).
   */
  guardarDelServidor(viajes: ViajeLocal[]): void;
  marcarIniciado(viajeId: string): void;
  marcarCanceladoAlSincronizar(viajeId: string): void;
  /** La entrega o el rechazo ya está en la cola: el viaje deja de estar en ruta en el celular. */
  marcarEntregaLocal(viajeId: string, tipo: 'ENTREGA' | 'RECHAZO'): void;
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

/** Cerrar sesión: revoca el refresh token en Keycloak (si hay red) y lo borra del celular. */
export interface SesionCerrable {
  cerrar(): Promise<void>;
}

/** El GPS en segundo plano y la tarea de sincronización de fondo, que se detienen al cerrar sesión. */
export interface TareasDeFondo {
  detener(): Promise<void>;
}

/** Lo que el chofer dejó en el celular (viajes, cola, evidencias, puntos GPS y la última posición), para borrarlo al salir. */
export interface DatosDelChofer {
  borrar(): void;
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

export interface Evidencias {
  agregar(e: EvidenciaLocal): void;
  porId(evidenciaId: string): EvidenciaLocal | null;
  marcarCompleta(evidenciaId: string): void;
}

/** La subida abierta en Viajes: URL firmadas de las partes que faltan y las que S3 ya tiene (ListParts). */
export interface Subida {
  estado: 'SUBIENDO' | 'COMPLETA';
  tamanoParteBytes: number;
  partes: { numero: number; url: string }[];
  subidas: Parte[];
}

export interface ApiEvidencias {
  abrir(e: EvidenciaLocal, token: string): Promise<{ respuesta: Respuesta; subida: Subida | null }>;
  /** PUT de los bytes a la URL firmada de S3; devuelve el ETag o null si no llegó. */
  subirParte(url: string, bytes: Uint8Array): Promise<string | null>;
  completar(e: EvidenciaLocal, partes: Parte[], token: string): Promise<Respuesta>;
}

export interface Archivos {
  /** Copia el archivo al almacenamiento de la app y devuelve su ruta y tamaño. */
  guardar(origen: string, nombre: string): { archivo: string; tamanoBytes: number };
  leer(archivo: string, desde: number, hasta: number): Uint8Array;
}

export type NuevaOperacion = { viajeId: string; tipo: TipoOperacion; cuerpo: Record<string, unknown> };
