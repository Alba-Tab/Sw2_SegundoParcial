import { CasosDeUso } from '../aplicacion/casosDeUso';
import { MotorSincronizacion } from '../aplicacion/motorSincronizacion';
import { SubidaEvidencias } from '../aplicacion/subidaEvidencias';
import { ApiEvidenciasHttp } from './apiEvidencias';
import { ApiViajes } from './apiViajes';
import { archivos } from './archivos';
import { bd } from './bd';
import { dispositivo, ids, red, reloj } from './plataforma';
import { avisadorLocal } from './push';
import { ColaSqlite, EvidenciasSqlite, FatigasSqlite, PosicionSqlite, PuntosSqlite, ViajesSqlite } from './repositorios';
import { SesionKeycloak } from './sesion';

/** Raíz de composición: los adaptadores concretos detrás de los puertos (Clean). */
export const cola = new ColaSqlite();
export const puntos = new PuntosSqlite();
export const viajes = new ViajesSqlite();
export const sesion = new SesionKeycloak();
export const evidencias = new EvidenciasSqlite();
export const fatigasSinPosicion = new FatigasSqlite();
const api = new ApiViajes();
const subida = new SubidaEvidencias(evidencias, new ApiEvidenciasHttp(), archivos);

export const motor = new MotorSincronizacion(cola, puntos, viajes, api, sesion, red, reloj, ids, dispositivo, subida);
export const casos = new CasosDeUso(
  cola,
  puntos,
  viajes,
  api,
  sesion,
  reloj,
  ids,
  dispositivo,
  evidencias,
  archivos,
  new PosicionSqlite(),
  (fn) => bd.transaction(() => fn()),
  fatigasSinPosicion,
  avisadorLocal,
);
