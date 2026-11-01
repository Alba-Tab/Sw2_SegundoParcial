import { type AbstractControl, type ValidatorFn, Validators } from '@angular/forms';
import { aCentavos, esMonto, mensajeCampo } from 'ui-comun/dominio';

/**
 * Formularios reactivos del Centro de Control (U8, W4). El botón de enviar queda activo: al enviar con errores se
 * marcan todos los campos (sale el `mat-error` de cada uno) y se enfoca el primero inválido.
 */

/** Monto como texto decimal mayor que 0 (000 §3: nunca float). Vacío lo decide `Validators.required`. */
export const validarMonto: ValidatorFn = (c) => {
  const texto = String(c.value ?? '');
  if (!texto.trim()) return null;
  if (!esMonto(texto)) return { monto: true };
  return (aCentavos(texto) ?? 0n) > 0n ? null : { montoCero: true };
};

/** Largo sin contar los espacios de los bordes (`Validators.minLength` sí los cuenta). Vacío pasa si `min` es 0. */
export const largoEntre =
  (min: number, max: number): ValidatorFn =>
  (c) => {
    const n = String(c.value ?? '').trim().length;
    if (!n && !min) return null;
    if (n < min) return { largoMinimo: { min } };
    return n > max ? { largoMaximo: { max } } : null;
  };

/** Devuelve true si se puede enviar; si no, marca los campos y lleva el foco al primero con error dentro de `raiz`. */
export function listoParaEnviar(form: AbstractControl, raiz: HTMLElement): boolean {
  if (form.valid) return true;
  form.markAllAsTouched();
  // El orden del DOM es el orden de lectura; ng-invalid lo pone la directiva de cada campo (input, textarea, mat-select).
  raiz.querySelector<HTMLElement>('[formControlName].ng-invalid, [formControl].ng-invalid')?.focus();
  return false;
}

/**
 * Un texto que exige distinto según el botón (nota opcional para aprobar, motivo obligatorio para rechazar): fija lo
 * que pide el campo para esa acción y valida como `listoParaEnviar`.
 */
export function exigirTexto(control: AbstractControl, min: number, max: number, raiz: HTMLElement): boolean {
  control.setValidators(min ? [Validators.required, largoEntre(min, max)] : [largoEntre(0, max)]);
  control.updateValueAndValidity();
  return listoParaEnviar(control, raiz);
}

/** El texto del error de un campo, para su `<mat-error>{{ textoError(form.controls.monto) }}</mat-error>`. */
export const textoError = (control: AbstractControl | null | undefined): string => mensajeCampo(control?.errors);

/** Lleva el foco a un elemento que aparece con el próximo render (el campo de una confirmación, el botón que la abrió). */
export function enfocar(id: string): void {
  setTimeout(() => document.getElementById(id)?.focus());
}
