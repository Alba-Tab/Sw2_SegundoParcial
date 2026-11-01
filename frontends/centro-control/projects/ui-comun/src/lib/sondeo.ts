import { defer, map, type OperatorFunction } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { filasConError, servicioCaido } from './errores';

/**
 * Campos de las filas de una lista raíz que otro servicio llena (`clientes[i].lineaCredito` sale de Finanzas): si ese
 * servicio cae, la fila llega con el campo en null y la tabla que lo muestra se vacía. Se reponen por la clave de la fila.
 */
export type Anidados = Record<string, { clave: string; campos: readonly string[] }>;

type Fila = Record<string, unknown>;

/** Repone en las filas con error de `lista` los campos anidados desde la última respuesta buena, emparejando por clave. */
function reponerAnidados(error: unknown, lista: string, actual: unknown, previo: unknown, a: Anidados[string]): Fila[] | null {
  if (!Array.isArray(actual) || !Array.isArray(previo)) return null;
  const anteriores = new Map((previo as Fila[]).map((f) => [f?.[a.clave], f]));
  let cambio = false;
  const filas = (actual as Fila[]).map((fila, i) => {
    const antes = anteriores.get(fila?.[a.clave]);
    if (!antes) return fila;
    let nueva = fila;
    for (const campo of a.campos) {
      // Solo si el error es de esa fila: un null sin error (cliente sin línea) es un dato, no un fallo.
      if (fila[campo] !== null && fila[campo] !== undefined) continue;
      if (antes[campo] === null || antes[campo] === undefined || !filasConError(error, lista, campo).has(i)) continue;
      nueva = { ...nueva, [campo]: antes[campo] };
      cambio = true;
    }
    return nueva;
  });
  return cambio ? filas : null;
}

/** Un resultado del sondeo con la hora de los datos que se siguen mostrando tras un fallo (instante ISO). */
export type ConDatosAl<R> = R & { datosAl?: string };

/**
 * Datos ya mostrados no desaparecen por un fallo (FB-1). Con `errorPolicy: 'all'`, un sondeo que falla (red, Gateway o
 * un servicio caído) emite el campo en `null` o sin `data`, y la tabla que ya tenía filas quedaba vacía. Este operador
 * repone cada campo raíz que llegó vacío por uno de esos fallos (no por `NO_ENCONTRADO` ni `SIN_PERMISO`) desde la
 * última respuesta sin errores y dice de cuándo es
 * (`datosAl`), para que `cc-aviso-servicios` lo muestre junto a «Reintentar». Una respuesta sin errores manda siempre.
 */
export function conservarUltimoBueno<R extends { data?: unknown; error?: unknown }>(
  ahora: () => string = () => new Date().toISOString(),
  anidados: Anidados = {},
): OperatorFunction<R, ConDatosAl<R>> {
  return (fuente) =>
    defer(() => {
      let bueno: Record<string, unknown> | undefined;
      let buenoEn: string | undefined;
      return fuente.pipe(
        map((r): ConDatosAl<R> => {
          const data = (r.data ?? undefined) as Record<string, unknown> | undefined;
          if (!r.error) {
            if (data) [bueno, buenoEn] = [data, ahora()];
            return r;
          }
          if (!bueno) return r;
          const mezcla: Record<string, unknown> = { ...data };
          let repuesto = false;
          // R1F-6: solo un fallo de red o del Gateway, o el servicio del campo caído. Con NO_ENCONTRADO o SIN_PERMISO
          // el dato viejo ya no vale y no se muestra como si solo hubiera fallado la red.
          const deRed = !CombinedGraphQLErrors.is(r.error);
          for (const [campo, valor] of Object.entries(bueno)) {
            if (mezcla[campo] !== null && mezcla[campo] !== undefined) continue;
            if (!deRed && !servicioCaido(r.error, campo)) continue;
            mezcla[campo] = valor;
            repuesto = true;
          }
          for (const [lista, a] of Object.entries(anidados)) {
            const filas = reponerAnidados(r.error, lista, mezcla[lista], bueno[lista], a);
            if (filas) [mezcla[lista], repuesto] = [filas, true];
          }
          return repuesto ? { ...r, data: mezcla as R['data'], datosAl: buenoEn } : r;
        }),
      );
    });
}
