import { DecimalPipe } from '@angular/common';
import { afterNextRender, Component, computed, effect, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Encabezado,
  AvisoServicios,
  Estado,
  EtiquetaPipe,
  fechaLaPaz,
  FechaPipe,
  mensajeDe,
  Sesion,
  vigencia,
  Esqueleto,
  Confirmacion,
  etiqueta,
  largoEntre,
  listoParaEnviar,
  textoError,
} from 'ui-comun';
import {
  AVISO_KM,
  CHECKLIST_POR_DEFECTO,
  checklistValido,
  cierreInicial,
  documentosEnAviso,
  puedeProgramar,
  type ItemCierre,
  type Mantenimiento,
  type NuevoMantenimiento,
} from '../domain/unidad';
import { UnidadFachada } from '../unidades.fachada';

/** Spec 010: programar un mantenimiento (la unidad pasa a EN_MANTENIMIENTO) y cerrarlo con su checklist. */
@Component({
  selector: 'app-unidad',
  providers: [UnidadFachada],
  imports: [
    Esqueleto,
    Encabezado,
    ReactiveFormsModule,
    Confirmacion,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    @let titulo = unidad()?.placa ?? 'Unidad';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Unidades', ruta: '/unidades' }, { texto: titulo }]">
      <!-- Un @if por nodo: el encabezado proyecta cc-estado junto al título y lo demás en la zona de acciones. -->
      @if (unidad(); as u) {
        <cc-estado grupo="EstadoUnidad" [valor]="u.estado" />
      }
      @if (unidad(); as u) {
        @if (sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
          <button
            mat-stroked-button
            #botonProgramar
            (click)="programando() ? cerrarFormulario() : abrirFormulario()"
            [attr.aria-expanded]="programando()"
            aria-controls="programar"
          >
            <mat-icon>build</mat-icon>Programar mantenimiento
          </button>
        }
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!unidad()" />
    @if (unidad(); as u) {
      @if (documentosEnAviso(u.documentos); as n) {
        <p class="aviso-documentos" role="status">
          <mat-icon>warning</mat-icon>{{ n === 1 ? 'Un documento vencido o por vencer' : n + ' documentos vencidos o por vencer' }}.
          @if (sesion.tiene('jefe_flota')) {
            Para {{ n === 1 ? 'renovarlo' : 'renovarlos' }}, programa un mantenimiento de tipo «Documentos».
          }
        </p>
      }
      <dl class="datos">
        <div>
          <dt>Tipo</dt>
          <dd>{{ u.tipoUnidad | etiqueta: 'TipoUnidad' }} {{ u.tipoRemolque ? (u.tipoRemolque | etiqueta: 'TipoRemolque') : '' }}</dd>
        </div>
        <div>
          <dt>Kilometraje</dt>
          <dd>{{ u.kilometraje !== null && u.kilometraje !== undefined ? (u.kilometraje | number) + ' km' : '—' }}</dd>
        </div>
        <div>
          <dt>Desde el último mantenimiento</dt>
          <dd [class.no-disponible]="u.kmDesdeUltimoMantenimiento >= avisoKm">{{ u.kmDesdeUltimoMantenimiento | number }} km</dd>
        </div>
        @for (d of u.documentos; track d.tipo) {
          <div>
            <dt>{{ d.tipo | etiqueta: 'TipoDocumento' }} vence</dt>
            <dd>{{ d.venceEl | fecha }} <cc-estado grupo="Vigencia" [valor]="vigencia(d.venceEl)" /></dd>
          </div>
        }
      </dl>

      @if (programando() && sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
        <mat-card class="formulario" id="programar">
          <mat-card-header><mat-card-title>Programar mantenimiento</mat-card-title></mat-card-header>
          <mat-card-content>
            <form [formGroup]="nuevo" (ngSubmit)="programar(u.unidadId, formProgramar)" #formProgramar novalidate>
              <div class="fila-acciones">
                <mat-form-field>
                  <mat-label>Tipo</mat-label>
                  <mat-select formControlName="tipo" #primerCampo>
                    @for (t of tiposMantenimiento; track t) {
                      <mat-option [value]="t">{{ t | etiqueta: 'TipoMantenimiento' }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Fecha</mat-label>
                  <input matInput type="date" formControlName="fechaProgramada" />
                  <mat-error>{{ textoError(nuevo.controls.fechaProgramada) }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Taller</mat-label>
                  <input matInput formControlName="taller" />
                  <mat-error>{{ textoError(nuevo.controls.taller) }}</mat-error>
                </mat-form-field>
              </div>
              <mat-form-field class="ancho">
                <mat-label>Descripción</mat-label>
                <input matInput formControlName="descripcion" />
                <mat-error>{{ textoError(nuevo.controls.descripcion) }}</mat-error>
              </mat-form-field>
              <mat-form-field class="ancho">
                <mat-label>Checklist (una línea por ítem)</mat-label>
                <textarea matInput rows="4" formControlName="checklist"></textarea>
                <mat-error>{{ textoError(nuevo.controls.checklist) }}</mat-error>
              </mat-form-field>
              <div class="fila-acciones">
                <button mat-flat-button type="submit" [disabled]="enviando()">Programar</button>
                <button mat-button type="button" (click)="cerrarFormulario()" [disabled]="enviando()">Cancelar</button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      }

      <h2>Mantenimientos</h2>
      @for (m of mantenimientos(); track m.mantenimientoId) {
        <mat-card class="mantenimiento">
          <mat-card-header>
            <mat-card-title>{{ m.tipo | etiqueta: 'TipoMantenimiento' }} · {{ m.fechaProgramada | fecha }} · {{ m.taller }}</mat-card-title>
            <mat-card-subtitle><cc-estado grupo="EstadoMantenimiento" [valor]="m.estado" /> {{ m.descripcion }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (m.estado === 'EN_CURSO' && sesion.tiene('jefe_flota') && formsCierre[m.mantenimientoId]; as fc) {
              @for (i of cierres[m.mantenimientoId] ?? []; track i.item) {
                <mat-checkbox [checked]="i.ok" (change)="i.ok = $event.checked">{{ i.item }}</mat-checkbox>
              }
              <div class="fila-acciones" [formGroup]="fc" #zonaCierre>
                @if (u.tipoUnidad === 'TRACTO') {
                  <mat-form-field>
                    <mat-label>Kilometraje</mat-label>
                    <input matInput type="number" min="0" inputmode="numeric" formControlName="kilometraje" />
                    <mat-error>{{ textoError(fc.controls.kilometraje) }}</mat-error>
                  </mat-form-field>
                }
                <mat-form-field class="ancho">
                  <mat-label>Observaciones</mat-label>
                  <input matInput formControlName="observaciones" />
                  <mat-error>{{ textoError(fc.controls.observaciones) }}</mat-error>
                </mat-form-field>
                @if (cerrando() !== m.mantenimientoId) {
                  <button mat-stroked-button (click)="pedirCierre(m.mantenimientoId, zonaCierre)" [disabled]="enviando()">
                    <mat-icon>lock</mat-icon>Cerrar mantenimiento
                  </button>
                }
              </div>
              @if (cerrando() === m.mantenimientoId) {
                <cc-confirmacion
                  [resumen]="resumenCierre(m, u.placa)"
                  accion="Sí, cerrar el mantenimiento"
                  icono="lock"
                  [enviando]="enviando()"
                  (confirmar)="cerrar(m.mantenimientoId)"
                  (volver)="cerrando.set(null)"
                />
              }
            } @else {
              @for (i of m.checklist; track i.item) {
                <span class="secundario">{{ i.ok ? '✔' : i.ok === false ? '✘' : '·' }} {{ i.item }} </span>
              }
              @if (m.cerradoEn) {
                <p class="secundario">Cerrado {{ m.cerradoEn | fecha: true }} {{ m.observaciones ?? '' }}</p>
              }
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="secundario">Sin mantenimientos.</p>
      }
    }
  `,
  styles: `
    .aviso-documentos {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    .formulario,
    .mantenimiento {
      margin: 16px 0;
    }
    .ancho {
      width: 100%;
    }
    mat-checkbox {
      display: block;
    }
  `,
})
export class UnidadPagina {
  private readonly fachada = inject(UnidadFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  readonly unidad = this.fachada.unidad;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { unidad: 'Flota', mantenimientos: 'Flota' };
  readonly puedeProgramar = puedeProgramar;
  readonly vigencia = (venceEl: string) => vigencia(venceEl);
  readonly documentosEnAviso = documentosEnAviso;
  readonly avisoKm = AVISO_KM;
  /** El formulario de programar se abre desde la acción del encabezado. */
  readonly programando = signal(false);
  readonly mantenimientos = computed(() => {
    const lista = this.fachada.mantenimientos();
    const tracto = this.unidad()?.tipoUnidad === 'TRACTO';
    for (const m of lista) {
      this.cierres[m.mantenimientoId] ??= cierreInicial(m);
      this.formsCierre[m.mantenimientoId] ??= formularioCierre(tracto);
    }
    return lista;
  });
  readonly enviando = signal(false);
  /** Cerrar un mantenimiento no se deshace: el que está pidiendo confirmación. */
  readonly cerrando = signal<string | null>(null);
  readonly textoError = textoError;
  readonly tiposMantenimiento = ['PREVENTIVO', 'CORRECTIVO', 'DOCUMENTOS'] as const;
  private readonly botonProgramar = viewChild<MatButton>('botonProgramar');
  private readonly primerCampo = viewChild<MatSelect>('primerCampo');
  private readonly injector = inject(Injector);
  readonly nuevo = new FormGroup({
    tipo: new FormControl<NuevoMantenimiento['tipo']>('PREVENTIVO', { nonNullable: true }),
    fechaProgramada: new FormControl(fechaLaPaz(), { nonNullable: true, validators: [Validators.required] }),
    taller: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 120)] }),
    descripcion: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(1, 1000)] }),
    checklist: new FormControl(CHECKLIST_POR_DEFECTO, {
      nonNullable: true,
      validators: [(c) => (checklistValido(c.value) ? null : { lineas: true })],
    }),
  });
  cierres: Record<string, ItemCierre[]> = {};
  formsCierre: Record<string, ReturnType<typeof formularioCierre>> = {};

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  /** Abre el formulario de programar con el foco en su primer campo: aparece debajo de los datos, fuera de la vista en móvil (C-7). */
  abrirFormulario(): void {
    this.programando.set(true);
    afterNextRender(() => this.primerCampo()?.focus(), { injector: this.injector });
  }

  /** Cierra el formulario de programar y devuelve el foco al botón que lo abrió. */
  cerrarFormulario(): void {
    this.programando.set(false);
    this.botonProgramar()?.focus();
  }

  async programar(unidadId: string, raiz: HTMLElement) {
    if (!listoParaEnviar(this.nuevo, raiz)) return;
    const v = this.nuevo.getRawValue();
    const nuevo = { ...v, taller: v.taller.trim(), descripcion: v.descripcion.trim() };
    if (await this.enviar(() => this.fachada.programar(unidadId, nuevo), 'Mantenimiento programado')) {
      this.nuevo.reset();
      this.cerrarFormulario();
    }
  }

  pedirCierre(mantenimientoId: string, raiz: HTMLElement): void {
    if (listoParaEnviar(this.formsCierre[mantenimientoId], raiz)) this.cerrando.set(mantenimientoId);
  }

  resumenCierre(m: Mantenimiento, placa: string): string {
    const items = this.cierres[m.mantenimientoId] ?? [];
    const km = this.formsCierre[m.mantenimientoId]?.controls.kilometraje.value;
    return (
      `Se cierra el mantenimiento ${etiqueta('TipoMantenimiento', m.tipo).texto.toLowerCase()} de ${placa} con ` +
      `${items.filter((i) => i.ok).length} de ${items.length} ítems hechos${km !== null && km !== undefined ? ` y ${km} km` : ''}. ` +
      'No se puede deshacer.'
    );
  }

  async cerrar(mantenimientoId: string) {
    const v = this.formsCierre[mantenimientoId].getRawValue();
    const cierre = {
      kilometraje: v.kilometraje ?? undefined,
      checklist: this.cierres[mantenimientoId],
      observaciones: v.observaciones.trim() || undefined,
    };
    await this.enviar(() => this.fachada.cerrar(mantenimientoId, cierre), 'Mantenimiento cerrado');
    this.cerrando.set(null);
  }

  private async enviar(accion: () => Promise<unknown>, ok: string): Promise<boolean> {
    this.enviando.set(true);
    try {
      await accion();
      this.avisos.open(ok, undefined, { duration: 4000 });
      await this.fachada.recargar();
      return true;
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
      return false;
    } finally {
      this.enviando.set(false);
    }
  }
}

/** Cierre de un mantenimiento: el kilometraje es obligatorio en tractos y prohibido en remolques (contrato de Flota). */
function formularioCierre(tracto: boolean) {
  return new FormGroup({
    kilometraje: new FormControl<number | null>(null, tracto ? [Validators.required, Validators.min(0)] : []),
    observaciones: new FormControl('', { nonNullable: true, validators: [largoEntre(0, 1000)] }),
  });
}
