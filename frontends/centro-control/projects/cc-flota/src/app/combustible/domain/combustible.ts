import type { CombustibleQuery } from '../../graphql/generado';

/** Anomalías de Isolation Forest (FF2) y cargas de combustible. Sin Angular ni Apollo. */
export type Anomalia = NonNullable<CombustibleQuery['anomaliasCombustible']>[number];
export type Carga = NonNullable<CombustibleQuery['cargasCombustible']>[number];

/** La pantalla mira las anomalías de los últimos 30 días. */
export const DIAS_ANOMALIAS = 30;
