import { Component, input } from '@angular/core';
import { type AbstractControl, FormControl, FormGroup, ReactiveFormsModule, type ValidatorFn, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Campo } from 'ui-comun';
import { ATRIBUTOS, CAMPOS_ATRIBUTO, mensajeUnidad, PLACA, type ClaseUnidad } from '../domain/unidad';

const entero: ValidatorFn = (c) => (c.value === null || Number.isInteger(c.value) ? null : { entero: true });

/** La placa del contrato de Flota; se acepta en minúsculas y se envía en mayúsculas. */
export const validarPlaca: ValidatorFn = (c) => (!c.value || PLACA.test(String(c.value).trim().toUpperCase()) ? null : { placa: true });

/** Capacidad, SOAT, inspección técnica y atributos: lo que comparten el alta y la edición de una unidad (spec 010). */
export function formularioCampos() {
  return new FormGroup({
    // Flota: mayor que 0 y hasta 30 t (D03).
    capacidadToneladas: new FormControl<number | null>(null, [Validators.required, Validators.min(0.1), Validators.max(30)]),
    soat: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    inspeccion: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    atributos: new FormGroup(
      Object.fromEntries(CAMPOS_ATRIBUTO.map((campo) => [campo, new FormControl<number | null>(null)])) as Record<
        string,
        FormControl<number | null>
      >,
    ),
  });
}
export type FormCampos = ReturnType<typeof formularioCampos>;

/** Activa la capacidad solo en remolques y los atributos de la clase con sus rangos (D76); el resto queda fuera. */
export function ajustarCampos(form: FormCampos, clase: ClaseUnidad | null): void {
  const capacidad = form.controls.capacidadToneladas;
  if (clase && clase !== 'TRACTO') capacidad.enable();
  else capacidad.disable();
  const reglas = clase ? ATRIBUTOS[clase] : [];
  for (const [campo, control] of Object.entries(form.controls.atributos.controls)) {
    const r = reglas.find((x) => x.campo === campo);
    if (!r) {
      control.disable();
      continue;
    }
    control.setValidators([
      ...(r.opcional ? [] : [Validators.required]),
      Validators.min(r.min),
      ...(r.max !== undefined ? [Validators.max(r.max)] : []),
      ...(r.entero ? [entero] : []),
    ]);
    control.enable();
  }
}

/** Los campos comunes de una unidad, dentro del `<form>` de la página (el envío y el foco los maneja ella). */
@Component({
  selector: 'app-campos-unidad',
  imports: [ReactiveFormsModule, Campo, MatFormFieldModule, MatInputModule],
  template: `
    <div class="fila-acciones" [formGroup]="form()">
      @if (clase() && clase() !== 'TRACTO') {
        <mat-form-field>
          <mat-label>Capacidad (toneladas)</mat-label>
          <input matInput type="number" min="0" max="30" step="0.1" formControlName="capacidadToneladas" />
          <mat-error>{{ error(form().controls.capacidadToneladas) }}</mat-error>
        </mat-form-field>
      }
      <mat-form-field>
        <mat-label>SOAT vence</mat-label>
        <input matInput type="date" formControlName="soat" />
        <mat-error>{{ error(form().controls.soat) }}</mat-error>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Inspección técnica vence</mat-label>
        <input matInput type="date" formControlName="inspeccion" />
        <mat-error>{{ error(form().controls.inspeccion) }}</mat-error>
      </mat-form-field>
    </div>
    @if (clase(); as c) {
      <div class="fila-acciones" [formGroup]="form().controls.atributos">
        @for (r of atributos[c]; track r.campo) {
          <mat-form-field>
            <mat-label>{{ r.etiqueta }}{{ r.opcional ? ' (opcional)' : '' }}</mat-label>
            <input matInput type="number" [formControlName]="r.campo" [min]="r.min" [attr.max]="r.max ?? null" />
            <mat-error>{{ error(form().controls.atributos.controls[r.campo]) }}</mat-error>
          </mat-form-field>
        }
      </div>
    }
  `,
})
export class CamposUnidad {
  readonly form = input.required<FormCampos>();
  readonly clase = input<ClaseUnidad | null>(null);
  readonly atributos = ATRIBUTOS;
  readonly error = (c: AbstractControl | undefined) => mensajeUnidad(c?.errors);
}
