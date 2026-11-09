import { afterNextRender, Component, computed, type ElementRef, input, type OnInit, output, signal, viewChild } from '@angular/core';
import { type AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Campo, Confirmacion, enfocar, largoEntre, listoParaEnviar, textoError, Panel } from 'ui-comun';
import {
  activaLaRuta,
  AVISO_ACTIVAR_SIN_TARIFA,
  CONFIRMAR_ACTIVAR,
  AVISO_ALTA_INACTIVA,
  type FichaRuta,
  LIMITES_RUTA,
  valoresIniciales,
  type ValoresRuta,
} from '../domain/ruta';

const numero = (min: number, max: number) => [Validators.required, Validators.min(min), Validators.max(max)];
const entero = (c: AbstractControl) => (c.value === null || Number.isInteger(c.value) ? null : { entero: true });

/**
 * Alta o edición de una ruta (G4). El botón queda activo: al enviar con errores se marca cada campo y se enfoca el
 * primero (U8, W4). Los límites son los de RutaNueva en viajes.yaml; Viajes vuelve a validar.
 */
@Component({
  selector: 'app-ruta-formulario',
  imports: [Panel, ReactiveFormsModule, Campo, Confirmacion, MatButtonModule, MatFormFieldModule, MatInputModule, MatCheckboxModule],
  template: `
    <cc-panel class="formulario" titulo="{{ titulo() }}">
      <form [formGroup]="form" (ngSubmit)="enviar(raiz)" #raiz novalidate>
        <mat-form-field class="ancho">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="nombre" #primerCampo />
          <mat-error>{{ texto(form.controls.nombre) }}</mat-error>
        </mat-form-field>
        <fieldset>
          <legend>Origen</legend>
          <div class="fila-acciones">
            <mat-form-field>
              <mat-label>Lugar</mat-label>
              <input matInput formControlName="origen" />
              <mat-error>{{ texto(form.controls.origen) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Latitud</mat-label>
              <input matInput type="number" step="any" formControlName="origenLat" />
              <mat-error>{{ texto(form.controls.origenLat) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Longitud</mat-label>
              <input matInput type="number" step="any" formControlName="origenLng" />
              <mat-error>{{ texto(form.controls.origenLng) }}</mat-error>
            </mat-form-field>
          </div>
        </fieldset>
        <fieldset>
          <legend>Destino</legend>
          <div class="fila-acciones">
            <mat-form-field>
              <mat-label>Lugar</mat-label>
              <input matInput formControlName="destino" />
              <mat-error>{{ texto(form.controls.destino) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Latitud</mat-label>
              <input matInput type="number" step="any" formControlName="destinoLat" />
              <mat-error>{{ texto(form.controls.destinoLat) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Longitud</mat-label>
              <input matInput type="number" step="any" formControlName="destinoLng" />
              <mat-error>{{ texto(form.controls.destinoLng) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Radio de la geocerca (m)</mat-label>
              <input matInput type="number" step="1" inputmode="numeric" formControlName="radioMetros" />
              <mat-hint>De {{ limites.radioMin }} a {{ limites.radioMax }} m</mat-hint>
              <mat-error>{{ texto(form.controls.radioMetros) }}</mat-error>
            </mat-form-field>
          </div>
        </fieldset>
        <div class="fila-acciones">
          <mat-form-field>
            <mat-label>Distancia (km)</mat-label>
            <input matInput type="number" step="0.1" inputmode="decimal" formControlName="distanciaKm" />
            <mat-error>{{ texto(form.controls.distanciaKm) }}</mat-error>
          </mat-form-field>
          @if (!alta()) {
            <mat-checkbox formControlName="activa">Ruta activa (se puede cotizar y programar)</mat-checkbox>
          }
        </div>
        <p class="secundario">{{ alta() ? avisoAlta : avisoActivar }}</p>
        @if (confirmando()) {
          <cc-confirmacion
            [resumen]="confirmarActivar"
            accion="Sí, activarla"
            icono="check_circle"
            [enviando]="enviando()"
            (confirmar)="confirmarActivacion()"
            (volver)="volver()"
          />
        } @else {
          <div class="fila-acciones">
            <button mat-flat-button type="submit" id="guardar-ruta" [disabled]="enviando()" disabledInteractive>{{ accion() }}</button>
            <button mat-button type="button" (click)="cancelar.emit()" [disabled]="enviando()">Cancelar</button>
          </div>
        }
      </form>
    </cc-panel>
  `,
  styles: `
    .formulario {
      margin: 16px 0;
    }
    .ancho {
      width: 100%;
    }
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
    }
    legend {
      font-weight: 500;
      margin-bottom: 8px;
    }
  `,
})
export class RutaFormulario implements OnInit {
  readonly titulo = input.required<string>();
  readonly accion = input.required<string>();
  /** La ruta que se edita; sin ella, es un alta. */
  readonly inicial = input<FichaRuta | null>(null);
  readonly enviando = input(false);
  readonly guardar = output<ValoresRuta>();
  readonly cancelar = output<void>();
  readonly limites = LIMITES_RUTA;
  readonly avisoAlta = AVISO_ALTA_INACTIVA;
  readonly avisoActivar = AVISO_ACTIVAR_SIN_TARIFA;
  readonly confirmarActivar = CONFIRMAR_ACTIVAR;
  readonly confirmando = signal(false);
  /** Sin ruta que editar es un alta: no se elige si está activa (F1-2). */
  readonly alta = computed(() => !this.inicial());
  private readonly primerCampo = viewChild<ElementRef<HTMLInputElement>>('primerCampo');
  readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 80)] }),
    origen: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(2, 80)] }),
    origenLat: new FormControl<number | null>(null, numero(-90, 90)),
    origenLng: new FormControl<number | null>(null, numero(-180, 180)),
    destino: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(2, 80)] }),
    destinoLat: new FormControl<number | null>(null, numero(-90, 90)),
    destinoLng: new FormControl<number | null>(null, numero(-180, 180)),
    radioMetros: new FormControl<number | null>(null, [...numero(LIMITES_RUTA.radioMin, LIMITES_RUTA.radioMax), entero]),
    distanciaKm: new FormControl<number | null>(null, numero(0.1, LIMITES_RUTA.kmMax)),
    activa: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    // El formulario aparece debajo de la lista o de los datos: el foco va a su primer campo (C-7).
    afterNextRender(() => this.primerCampo()?.nativeElement.focus());
  }

  ngOnInit(): void {
    this.form.reset(valoresIniciales(this.inicial()));
  }

  texto(control: AbstractControl): string {
    return control.errors?.['entero'] ? 'Escribe un número entero de metros.' : textoError(control);
  }

  enviar(raiz: HTMLElement): void {
    if (this.enviando() || !listoParaEnviar(this.form, raiz)) return;
    if (activaLaRuta(this.inicial(), this.form.getRawValue())) {
      // D108: el formulario queda bloqueado mientras se confirma.
      this.form.disable();
      this.confirmando.set(true);
      return;
    }
    this.guardar.emit(this.form.getRawValue());
  }

  confirmarActivacion(): void {
    const valores = this.form.getRawValue();
    this.volver(false);
    this.guardar.emit(valores);
  }

  /** «No, volver»: desbloquea y el foco vuelve a «Guardar cambios». */
  volver(enfocarGuardar = true): void {
    this.form.enable();
    this.confirmando.set(false);
    if (enfocarGuardar) enfocar('guardar-ruta');
  }
}
