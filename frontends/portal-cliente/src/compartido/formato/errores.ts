import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ErrorApi } from '../../api/cliente';

/** Lleva los `errores[]` de un 400 (000 §5) a los campos del formulario; devuelve true si marcó alguno. */
export function marcarCampos<T extends FieldValues>(error: unknown, marcar: UseFormSetError<T>, campos: readonly string[]): boolean {
  if (!(error instanceof ErrorApi) || error.estado !== 400) return false;
  let marcados = false;
  for (const e of error.problema?.errores ?? []) {
    if (campos.includes(e.campo)) {
      marcar(e.campo as Path<T>, { message: e.mensaje });
      marcados = true;
    }
  }
  return marcados;
}
