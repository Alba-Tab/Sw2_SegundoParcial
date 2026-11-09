export interface Reloj {
  ahora(): Date;
  /** Fecha de hoy en America/La_Paz (YYYY-MM-DD). */
  hoy(): string;
}
export const RELOJ = Symbol('Reloj');
