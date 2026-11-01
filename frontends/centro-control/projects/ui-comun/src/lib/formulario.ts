import { Directive, ElementRef, inject } from '@angular/core';
import { type AbstractControl, NgControl, type ValidatorFn, Validators } from '@angular/forms';
import { aCentavos, esMonto, mensajeCampo } from 'ui-comun/dominio';
import { BobPipe } from './formato';

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

/** Monto que no pasa del saldo (spec 008: mayor que el saldo da `PAGO_EXCEDE_SALDO`). Sin saldo conocido, no se limita. */
export const montoMaximo =
  (saldo: () => string | null | undefined): ValidatorFn =>
  (c) => {
    const tope = saldo();
    const [monto, max] = [aCentavos(String(c.value ?? '')), tope ? aCentavos(tope) : null];
    return monto !== null && max !== null && monto > max ? { montoMaximo: { saldo: new BobPipe().transform(tope) } } : null;
  };

/** Monto que no baja de `minimo` (spec 012: el límite no baja de lo reservado y utilizado). Sin mínimo conocido, no se limita. */
export const montoMinimo =
  (minimo: () => string | null | undefined): ValidatorFn =>
  (c) => {
    // El mínimo se lee solo con un monto escrito: al crear el control todavía puede no haber datos (input requerido).
    const monto = aCentavos(String(c.value ?? ''));
    const piso = monto === null ? null : minimo();
    const min = piso ? aCentavos(piso) : null;
    return monto !== null && min !== null && monto < min ? { montoMinimo: { minimo: new BobPipe().transform(piso) } } : null;
  };

/** Fecha ISO (`YYYY-MM-DD`) entre `desde` y `hasta`, si se dan; se leen al validar porque dependen de los datos. */
export const fechaEntre =
  (desde: () => string | null | undefined, hasta: () => string | null | undefined = () => null): ValidatorFn =>
  (c) => {
    const fecha = String(c.value ?? '');
    const [min, max] = [desde()?.slice(0, 10), hasta()?.slice(0, 10)];
    if (!fecha) return null;
    if (min && fecha < min) return { fechaMinima: { min } };
    return max && fecha > max ? { fechaMaxima: { max } } : null;
  };

/**
 * Largo sin contar los espacios de los bordes (`Validators.minLength` sí los cuenta). Vacío pasa si `min` es 0 o si el
 * campo es opcional (una nota que, si viene, tiene de 3 a 300 caracteres).
 */
export const largoEntre =
  (min: number, max: number, opcional = false): ValidatorFn =>
  (c) => {
    const n = String(c.value ?? '').trim().length;
    if (!n && (!min || opcional)) return null;
    if (n < min) return { largoMinimo: { min } };
    return n > max ? { largoMaximo: { max } } : null;
  };

/** Cada elemento con `[formControl]` o `formControlName` y su control, para saber cuál está inválido ahora mismo. */
const campos = new WeakMap<Element, NgControl>();

/**
 * Registra el elemento de cada campo (revisión E-1). Angular no escribe `[formControl]` como atributo y la clase
 * `ng-invalid` se pone recién en la próxima detección de cambios (no ve un `setValidators` recién hecho), así que el
 * foco no puede depender del DOM: se pregunta al control. Se importa junto a `ReactiveFormsModule`.
 */
@Directive({ selector: '[formControl], [formControlName]' })
export class Campo {
  constructor() {
    campos.set(inject(ElementRef<HTMLElement>).nativeElement, inject(NgControl, { self: true }));
  }
}

/** Si `control` es `form` o uno de sus descendientes. */
function esParteDe(control: AbstractControl | null, form: AbstractControl): boolean {
  for (let c = control; c; c = c.parent) if (c === form) return true;
  return false;
}

/**
 * El primer campo inválido de `form` dentro de `raiz`, en el orden del DOM (el orden de lectura). Solo los de `form`:
 * si se valida el motivo, no se enfoca otro campo inválido de la misma zona (revisión E-14).
 */
export function primerInvalido(raiz: HTMLElement, form: AbstractControl): HTMLElement | undefined {
  for (const el of raiz.querySelectorAll<HTMLElement>('*')) {
    const control = campos.get(el)?.control ?? null;
    if (!control?.invalid || !esParteDe(control, form)) continue;
    // mat-select se enfoca en su elemento; un mat-checkbox o mat-radio-group, en su input.
    return el.matches('input, textarea, select, [tabindex]') ? el : (el.querySelector<HTMLElement>('input, [tabindex]') ?? el);
  }
  return undefined;
}

/** Devuelve true si se puede enviar; si no, marca los campos y lleva el foco al primero con error dentro de `raiz`. */
export function listoParaEnviar(form: AbstractControl, raiz: HTMLElement): boolean {
  if (form.valid) return true;
  form.markAllAsTouched();
  primerInvalido(raiz, form)?.focus();
  return false;
}

/**
 * Un texto que exige distinto según el botón (nota opcional para aprobar, motivo obligatorio para rechazar): fija lo
 * que pide el campo para esa acción y valida como `listoParaEnviar`. Opcional con `min`: vacío o de `min` a `max`.
 */
export function exigirTexto(control: AbstractControl, min: number, max: number, raiz: HTMLElement, obligatorio = min > 0): boolean {
  control.setValidators(obligatorio ? [Validators.required, largoEntre(min, max)] : [largoEntre(min, max, true)]);
  control.updateValueAndValidity();
  return listoParaEnviar(control, raiz);
}

/** El texto del error de un campo, para su `<mat-error>{{ textoError(form.controls.monto) }}</mat-error>`. */
export const textoError = (control: AbstractControl | null | undefined): string => mensajeCampo(control?.errors);

/** Lleva el foco a un elemento que aparece con el próximo render (el campo de una confirmación, el botón que la abrió). */
export function enfocar(id: string): void {
  setTimeout(() => document.getElementById(id)?.focus());
}

/** Tras una acción que hace desaparecer el botón que tenía el foco, lo lleva al título de la página (`cc-encabezado`). */
export function enfocarTitulo(): void {
  setTimeout(() => document.querySelector<HTMLElement>('cc-encabezado h1')?.focus());
}
