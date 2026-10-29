/** Regla de negocio violada. `codigo` es el de specs/000-convenciones.md §5 y decide el estado HTTP. */
export class ErrorDeDominio extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeDominio';
  }
}
