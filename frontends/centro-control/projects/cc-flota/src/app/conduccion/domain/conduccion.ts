import type { ConduccionQuery } from '../../graphql/generado';

/** D84: max(0, 100 − 10 × (frenadas + 2 × fatigas) × 100 / km), por chofer en la semana. Lo calcula Analítica. */
export type PuntajesConduccion = NonNullable<ConduccionQuery['puntajesConduccion']>;

/** Debajo de este puntaje la fila se marca. */
export const PUNTAJE_BAJO = 70;
