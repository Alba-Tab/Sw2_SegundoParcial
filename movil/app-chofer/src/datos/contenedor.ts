import { CasosDeUso } from '../aplicacion/casosDeUso';
import { MotorSincronizacion } from '../aplicacion/motorSincronizacion';
import { ApiViajes } from './apiViajes';
import { dispositivo, ids, red, reloj } from './plataforma';
import { ColaSqlite, PuntosSqlite, ViajesSqlite } from './repositorios';
import { SesionKeycloak } from './sesion';

/** Raíz de composición: los adaptadores concretos detrás de los puertos (Clean). */
export const cola = new ColaSqlite();
export const puntos = new PuntosSqlite();
export const viajes = new ViajesSqlite();
export const sesion = new SesionKeycloak();
const api = new ApiViajes();

export const motor = new MotorSincronizacion(cola, puntos, viajes, api, sesion, red, reloj, ids, dispositivo);
export const casos = new CasosDeUso(cola, viajes, api, sesion, reloj, ids, dispositivo);
