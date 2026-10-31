import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';
import type { Contexto } from '../autenticacion';
import { rutaRest, type ClienteServicios } from '../servicios';
import * as m from './mapeos';

/** D97: sin filtro por ids en el servicio, las claves de un tipo se piden en paralelo, como máximo 10 a la vez. */
export const PARALELO = 10;

export async function enParalelo<K, V>(claves: readonly K[], pedir: (k: K) => Promise<V>, maximo = PARALELO): Promise<(V | Error)[]> {
  const resultados: (V | Error)[] = new Array(claves.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < claves.length) {
      const i = siguiente++;
      try {
        resultados[i] = await pedir(claves[i]);
      } catch (e) {
        resultados[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maximo, claves.length) }, trabajador));
  return resultados;
}

const status = (e: unknown) => (e instanceof GraphQLError ? e.extensions['status'] : undefined);
/**
 * Para lo que puede no existir todavía (la predicción, la entrega, la línea de crédito), un 404 es "no hay" (null) y no
 * un error del campo. Un viaje pedido por id que no existe sí es error: `NO_ENCONTRADO`, igual que `factura` y `unidad`.
 */
const nuloSi404 = async <T>(p: Promise<T>): Promise<T | null> => p.catch((e) => (status(e) === 404 ? null : Promise.reject(e)));

type Json = Record<string, unknown>;

/**
 * DataLoader por petición (spec 016, paso 8): junta las claves iguales de un mismo tipo, por ejemplo el `servicioId`
 * de 20 viajes, y pide cada una una sola vez, como máximo 10 a la vez (D97). También los campos por viaje de una lista
 * (`hitos`, `entrega`): sin esto, 100 viajes eran 100 llamadas simultáneas a Viajes.
 */
export function crearCargadores(servicios: ClienteServicios, ctx: Contexto) {
  const cargador = <V>(pedir: (k: string) => Promise<V>) => new DataLoader<string, V>((claves) => enParalelo(claves, pedir));
  return {
    servicio: cargador((id) => servicios.get<Json>(ctx, 'viajes', rutaRest`/api/v1/servicios/${id}`).then(m.servicio)),
    viaje: cargador((id) => servicios.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${id}`).then(m.viaje)),
    riesgo: cargador((id) => nuloSi404(servicios.get<Json>(ctx, 'analitica', rutaRest`/api/v1/predicciones/retraso/${id}`))),
    unidadPorPlaca: cargador((placa) =>
      servicios
        .get<Json>(ctx, 'flota', rutaRest`/api/v1/unidades`, { query: { placa, limite: 1 } })
        .then((r) => m.items(r).map(m.unidad)[0] ?? null),
    ),
    lineaCredito: cargador((id) =>
      nuloSi404(servicios.get<Json>(ctx, 'finanzas', rutaRest`/api/v1/lineas-credito/${id}`).then(m.lineaCredito)),
    ),
    /** Clave `JSON.stringify([viajeId, texto])`: la bitácora de un viaje, filtrada o no (listarHitos no pagina). */
    hitos: cargador((clave) => {
      const [viajeId, texto] = JSON.parse(clave) as [string, string | null];
      return servicios.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}/hitos`, { query: { texto } }).then((r) => m.items(r));
    }),
    entrega: cargador((viajeId) => nuloSi404(servicios.get<Json>(ctx, 'viajes', rutaRest`/api/v1/viajes/${viajeId}/entrega`))),
  };
}

export type Cargadores = ReturnType<typeof crearCargadores>;
