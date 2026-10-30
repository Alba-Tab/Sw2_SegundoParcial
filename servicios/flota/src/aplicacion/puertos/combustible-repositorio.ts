import type { Caida, Lectura } from '../../dominio/combustible/caida';
import type { CargaCombustible } from '../../dominio/combustible/carga';

export interface Deteccion extends Caida {
  deteccionId: string;
  tractoId: string;
  placa: string;
  viajeId?: string;
  velocidadKmh: number;
  detectadaEn: string;
  /** Inicio del episodio de parada: una detección por parada (spec 009). */
  paradaDesde: string;
}

export interface CombustibleRepositorio {
  /** La carga con ese opId (índice único: la autoridad de idempotencia, spec 009). */
  cargaPorOpId(opId: string): Promise<(CargaCombustible & { hashCuerpo: string }) | null>;
  insertarCarga(carga: CargaCombustible, hashCuerpo: string): Promise<void>;
  listarCargas(
    filtro: { tractoId?: string; choferId?: string; desde?: string; hasta?: string },
    despuesDe: string | undefined,
    limite: number,
  ): Promise<CargaCombustible[]>;

  /** false si ya había una lectura de esa placa en ese instante (índice único). */
  insertarLectura(lectura: Lectura): Promise<boolean>;
  /** Lecturas de la placa desde ese instante, en orden de tiempo. */
  lecturasDesde(placa: string, desde: string, hasta?: string): Promise<Lectura[]>;
  /**
   * Inicio del episodio de parada que termina en `hasta`: la primera lectura posterior a la última lectura en marcha
   * (velocidad > 0), sin límite de ventana. No cambia mientras el tracto siga detenido (spec 009: una detección por parada).
   */
  inicioDeParada(placa: string, hasta: string): Promise<string>;

  deteccionDeParada(placa: string, paradaDesde: string): Promise<boolean>;
  insertarDeteccion(d: Deteccion): Promise<void>;
}
export const COMBUSTIBLE_REPOSITORIO = Symbol('CombustibleRepositorio');
