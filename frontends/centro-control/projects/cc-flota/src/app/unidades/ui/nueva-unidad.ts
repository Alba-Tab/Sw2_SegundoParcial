import { afterNextRender, Component, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { merge } from 'rxjs';
import { Campo, Encabezado, EtiquetaPipe, listoParaEnviar, mensajeDe, Panel } from 'ui-comun';
import { claseUnidad, mensajeUnidad, nuevaUnidadDesde, type ClaseUnidad } from '../domain/unidad';
import { AltaUnidadFachada } from '../unidades.fachada';
import { ajustarCampos, CamposUnidad, formularioCampos, validarPlaca } from './campos-unidad';

/** Alta de un tracto o remolque (spec 010, paso 1; D104). Solo jefe_flota. */
@Component({
  selector: 'app-nueva-unidad',
  providers: [AltaUnidadFachada],
  imports: [
    Panel,
    Encabezado,
    ReactiveFormsModule,
    Campo,
    CamposUnidad,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    EtiquetaPipe,
    RouterLink,
  ],
  template: `
    <cc-encabezado titulo="Nueva unidad" [migas]="[{ texto: 'Unidades', ruta: '/unidades' }, { texto: 'Nueva unidad' }]" />
    <cc-panel titulo="Datos de la unidad">
      <form [formGroup]="form" (ngSubmit)="guardar(raiz)" #raiz novalidate>
        <div class="fila-acciones">
          <mat-form-field>
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="tipoUnidad" #primerCampo>
              @for (t of tipos; track t) {
                <mat-option [value]="t">{{ t | etiqueta: 'TipoUnidad' }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (clase() !== 'TRACTO') {
            <mat-form-field>
              <mat-label>Tipo de remolque</mat-label>
              <mat-select formControlName="tipoRemolque">
                @for (t of remolques; track t) {
                  <mat-option [value]="t">{{ t | etiqueta: 'TipoRemolque' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Placa</mat-label>
            <input matInput formControlName="placa" autocomplete="off" class="mayusculas" />
            <mat-hint>Por ejemplo 4521KTR</mat-hint>
            <mat-error>{{ error(form.controls.placa) }}</mat-error>
          </mat-form-field>
        </div>
        <div class="fila-acciones">
          @if (clase() === 'TRACTO') {
            <mat-form-field>
              <mat-label>Odómetro (km)</mat-label>
              <input matInput type="number" min="0" inputmode="numeric" formControlName="kilometraje" />
              <mat-error>{{ error(form.controls.kilometraje) }}</mat-error>
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Km desde el último mantenimiento</mat-label>
            <input matInput type="number" min="0" inputmode="numeric" formControlName="kmDesdeUltimoMantenimiento" />
            <mat-error>{{ error(form.controls.kmDesdeUltimoMantenimiento) }}</mat-error>
          </mat-form-field>
        </div>
        <app-campos-unidad [form]="form.controls.campos" [clase]="clase()" />
        <div class="fila-acciones">
          <button mat-flat-button type="submit" [disabled]="enviando()" disabledInteractive>
            <mat-icon>local_shipping</mat-icon>Registrar unidad
          </button>
          <a mat-button routerLink="/unidades">Cancelar</a>
        </div>
      </form>
    </cc-panel>
  `,
  styles: `
    .mayusculas {
      text-transform: uppercase;
    }
  `,
})
export class NuevaUnidadPagina {
  private readonly fachada = inject(AltaUnidadFachada);
  private readonly avisos = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly tipos = ['TRACTO', 'REMOLQUE'] as const;
  readonly remolques = ['FURGON', 'PLATAFORMA', 'CISTERNA'] as const;
  readonly enviando = signal(false);
  readonly clase = signal<ClaseUnidad | null>('TRACTO');
  readonly error = (c: { errors: Record<string, unknown> | null }) => mensajeUnidad(c.errors);
  private readonly primerCampo = viewChild<MatSelect>('primerCampo');
  readonly form = new FormGroup({
    tipoUnidad: new FormControl<'TRACTO' | 'REMOLQUE'>('TRACTO', { nonNullable: true }),
    tipoRemolque: new FormControl<'FURGON' | 'PLATAFORMA' | 'CISTERNA'>('FURGON', { nonNullable: true }),
    placa: new FormControl('', { nonNullable: true, validators: [Validators.required, validarPlaca] }),
    kilometraje: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    kmDesdeUltimoMantenimiento: new FormControl<number | null>(0, [Validators.required, Validators.min(0)]),
    campos: formularioCampos(),
  });

  constructor() {
    const { tipoUnidad, tipoRemolque } = this.form.controls;
    this.ajustar();
    merge(tipoUnidad.valueChanges, tipoRemolque.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.ajustar());
    afterNextRender(() => this.primerCampo()?.focus());
  }

  /** Lo que pide cada tipo: el tracto su odómetro; el remolque su tipo, su capacidad y sus atributos (D76). */
  private ajustar(): void {
    const { tipoUnidad, tipoRemolque, kilometraje } = this.form.controls;
    const tracto = tipoUnidad.value === 'TRACTO';
    // Sin emitir: este mismo cambio volvería a llamar a ajustar.
    if (tracto) tipoRemolque.disable({ emitEvent: false });
    else tipoRemolque.enable({ emitEvent: false });
    if (tracto) kilometraje.enable();
    else kilometraje.disable();
    const clase = claseUnidad(tipoUnidad.value, tipoRemolque.value);
    this.clase.set(clase);
    ajustarCampos(this.form.controls.campos, clase);
  }

  async guardar(raiz: HTMLElement): Promise<void> {
    if (this.enviando() || !listoParaEnviar(this.form, raiz)) return;
    const { campos, ...datos } = this.form.getRawValue();
    this.enviando.set(true);
    try {
      const unidadId = await this.fachada.crear(nuevaUnidadDesde(datos, campos));
      this.avisos.open('Unidad registrada', undefined, { duration: 4000 });
      await this.router.navigate(unidadId ? ['/unidades', unidadId] : ['/unidades']);
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
