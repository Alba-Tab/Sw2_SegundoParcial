import type { CombustibleQuery } from '../../graphql/generado';

/** Anomalías de Isolation Forest (FF2) y cargas de combustible. Sin Angular ni Apollo. */
export type Anomalia = NonNullable<CombustibleQuery['anomaliasCombustible']>[number];
export type Carga = NonNullable<CombustibleQuery['cargasCombustible']>[number];

/** La pantalla mira las anomalías de los últimos 30 días. */
export const DIAS_ANOMALIAS = 30;

/** Adónde lleva una placa: la ficha de su unidad si está entre las de Flota (5b); si no, la lista filtrada por la placa. */
export interface DestinoPlaca {
  ruta: string;
  q?: string;
}

export function destinosPorPlaca(unidades: readonly { unidadId: string; placa: string }[]): (placa: string) => DestinoPlaca {
  const ids = new Map(unidades.map((u) => [u.placa, u.unidadId]));
  return (placa) => {
    const id = ids.get(placa);
    return id ? { ruta: `/unidades/${id}` } : { ruta: '/unidades', q: placa };
  };
}
