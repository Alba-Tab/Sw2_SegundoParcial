import { errorGraphql } from './errores';

/**
 * Tope de llamadas REST a los servicios por petición GraphQL.
 *
 * La complejidad (D101) cuenta como 1 cada campo de una fila, pero varios campos de `Viaje` son una llamada por fila
 * (`monto`, `hitos`, `entrega`, `riesgo`, `unidad`), igual que `AccionPropuesta.viaje` y `Cliente.lineaCredito`. Así,
 * `tablero { viajesEnCurso { hitos riesgo unidad entrega } }` con 100 viajes pedía 400 llamadas con complejidad bajo
 * 1.000, y con alias de `hitos(texto:)` muchas más. Contar esas listas como 100 no sirve: la operación del tablero
 * llegaría a 1.711.
 *
 * Por eso cada petición HTTP a `/graphql` trae su presupuesto en el contexto, y el cliente REST lo descuenta antes de
 * cada llamada. Todos los cargadores pasan por ese cliente, así que lo que el DataLoader ya tiene no vuelve a contar.
 * Agotado el presupuesto, cada campo que pediría otra llamada sale en `null` con `CONSULTA_DEMASIADO_COMPLEJA`, sin
 * llamar al servicio, y el resto de la respuesta sale igual. La suscripción y la descarga de Excel no lo usan.
 *
 * 200 sale de medir cada operación de los `.graphql` de `frontends/centro-control/projects` con 100 filas por lista:
 * - `Tablero`: 105 llamadas (1 de viajes, 100 de riesgo, 1 de unidades, 2 de facturas y 1 de alertas). Con todas las
 *   páginas de los resúmenes (20 de unidades y 20 de cada consulta de facturas) son 162, el peor caso.
 * - `Acciones`: 101. `Mapa` y `EntregasObservadas`: 51. `Viaje`: 6. Las demás, 3 o menos.
 */
export const PRESUPUESTO_LLAMADAS = 200;

export class PresupuestoLlamadas {
  private gastadas = 0;

  constructor(readonly maximo = PRESUPUESTO_LLAMADAS) {}

  get usadas(): number {
    return this.gastadas;
  }

  /** Cuenta una llamada a `servicio`; sin presupuesto lanza `CONSULTA_DEMASIADO_COMPLEJA` y la llamada no se hace. */
  gastar(servicio: string): void {
    if (this.gastadas >= this.maximo) {
      throw errorGraphql(
        'CONSULTA_DEMASIADO_COMPLEJA',
        `La consulta necesita más de ${this.maximo} llamadas a los servicios; pide menos filas o menos campos por fila`,
        400,
        { servicio },
      );
    }
    this.gastadas++;
  }
}
