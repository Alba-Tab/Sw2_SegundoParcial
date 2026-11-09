/**
 * Regla de negocio violada. `codigo` es el de specs/000-convenciones.md §5 y decide el estado HTTP; `datos` viaja en el
 * DetalleFallo de las actividades de Temporal.
 */
export class ErrorDeDominio extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly datos?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorDeDominio';
  }
}
