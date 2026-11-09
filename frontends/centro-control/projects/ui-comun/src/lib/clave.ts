import { CombinedGraphQLErrors, ServerError, ServerParseError } from '@apollo/client/errors';
import { firstValueFrom, type Observable } from 'rxjs';

/** Una clave por intento (spec 016, paso 11): al abrir el diálogo o en cada clic de "Confirmar". */
export const nuevaClave = (): string => crypto.randomUUID();

/**
 * ¿El intento puede no haber llegado o seguir en curso? Red caída, 5xx (también `ERROR_INTERNO` y `DEPENDENCIA_NO_DISPONIBLE`, que el
 * Gateway da cuando el servicio no respondió a tiempo) o `409 IDEMPOTENCIA_EN_PROCESO`. Con eso se reenvía la misma
 * clave; cualquier otra respuesta es definitiva (000 §4.1).
 */
export function esTransitorio(error: unknown): boolean {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.some((e) => {
      const codigo = e.extensions?.['codigo'];
      return (
        codigo === 'IDEMPOTENCIA_EN_PROCESO' ||
        codigo === 'DEPENDENCIA_NO_DISPONIBLE' ||
        codigo === 'ERROR_INTERNO' ||
        Number(e.extensions?.['status']) >= 500
      );
    });
  }
  if (ServerError.is(error) || ServerParseError.is(error)) return error.statusCode >= 500;
  return true; // sin respuesta: red caída o tiempo de espera
}

/**
 * Claves de idempotencia de una pantalla (000 §4.1, spec 016 paso 11). Cada operación (por ejemplo
 * `registrarPago:<facturaId>`) conserva su clave solo mientras se reenvían los mismos datos después de un fallo
 * transitorio; si cambian los datos o llegó una respuesta definitiva (éxito o error de negocio), la clave es nueva.
 * Así un reintento tras un corte no duplica el cambio, y corregir el monto después de un 422 no choca con
 * `IDEMPOTENCIA_CUERPO_DISTINTO`.
 */
export class Intentos {
  private readonly vivos = new Map<string, { clave: string; huella: string }>();

  clave(operacion: string, datos: unknown): string {
    const huella = JSON.stringify(datos ?? null);
    const actual = this.vivos.get(operacion);
    if (actual?.huella === huella) return actual.clave;
    const nuevo = { clave: nuevaClave(), huella };
    this.vivos.set(operacion, nuevo);
    return nuevo.clave;
  }

  /** Después de la respuesta: se olvida la clave salvo que el intento haya fallado de forma transitoria. */
  terminar(operacion: string, error?: unknown): void {
    if (error === undefined || !esTransitorio(error)) this.vivos.delete(operacion);
  }

  /** Envía la mutación con la clave del intento y decide si conservarla. */
  async enviar<T>(operacion: string, datos: unknown, peticion: (clave: string) => Observable<T>): Promise<T> {
    const clave = this.clave(operacion, datos);
    try {
      const respuesta = await firstValueFrom(peticion(clave));
      this.terminar(operacion);
      return respuesta;
    } catch (e) {
      this.terminar(operacion, e);
      throw e;
    }
  }
}
