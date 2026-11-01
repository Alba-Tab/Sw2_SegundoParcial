import { defer, map, type OperatorFunction } from 'rxjs';

/** Un resultado del sondeo con la hora de los datos que se siguen mostrando tras un fallo (instante ISO). */
export type ConDatosAl<R> = R & { datosAl?: string };

/**
 * Datos ya mostrados no desaparecen por un fallo (FB-1). Con `errorPolicy: 'all'`, un sondeo que falla (red, Gateway o
 * un servicio caído) emite el campo en `null` o sin `data`, y la tabla que ya tenía filas quedaba vacía. Este operador
 * repone cada campo raíz que llegó vacío con error desde la última respuesta sin errores y dice de cuándo es
 * (`datosAl`), para que `cc-aviso-servicios` lo muestre junto a «Reintentar». Una respuesta sin errores manda siempre.
 */
export function conservarUltimoBueno<R extends { data?: unknown; error?: unknown }>(
  ahora: () => string = () => new Date().toISOString(),
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
          for (const [campo, valor] of Object.entries(bueno)) {
            if (mezcla[campo] !== null && mezcla[campo] !== undefined) continue;
            mezcla[campo] = valor;
            repuesto = true;
          }
          return repuesto ? { ...r, data: mezcla as R['data'], datosAl: buenoEn } : r;
        }),
      );
    });
}
