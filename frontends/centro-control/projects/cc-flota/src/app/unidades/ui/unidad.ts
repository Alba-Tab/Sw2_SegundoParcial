import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Encabezado, AvisoServicios, Estado, EtiquetaPipe, fechaLaPaz, FechaPipe, mensajeDe, Sesion, vigencia } from 'ui-comun';
import {
  AVISO_KM,
  CHECKLIST_POR_DEFECTO,
  cierreInicial,
  documentosEnAviso,
  puedeProgramar,
  type ItemCierre,
  type NuevoMantenimiento,
} from '../domain/unidad';
import { UnidadFachada } from '../unidades.fachada';

/** Spec 010: programar un mantenimiento (la unidad pasa a EN_MANTENIMIENTO) y cerrarlo con su checklist. */
@Component({
  selector: 'app-unidad',
  providers: [UnidadFachada],
  imports: [
    Encabezado,
    FormsModule,
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
          <button mat-flat-button (click)="programando.set(!programando())" [attr.aria-expanded]="programando()" aria-controls="programar">
            <mat-icon>build</mat-icon>Programar mantenimiento
          </button>
        }
      }
    </cc-encabezado>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!unidad()" />
    @if (unidad(); as u) {
      @if (documentosEnAviso(u.documentos); as n) {
        <p class="aviso-documentos" role="status">
          <mat-icon>warning</mat-icon>{{ n === 1 ? 'Un documento vencido o por vencer' : n + ' documentos vencidos o por vencer' }}. Para
          renovarlo, programa un mantenimiento de tipo «Documentos».
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
            <div class="fila-acciones">
              <mat-form-field
                ><mat-label>Tipo</mat-label>
                <mat-select [(ngModel)]="nuevo.tipo"
                  ><mat-option value="PREVENTIVO">Preventivo</mat-option><mat-option value="CORRECTIVO">Correctivo</mat-option
                  ><mat-option value="DOCUMENTOS">Documentos</mat-option></mat-select
                >
              </mat-form-field>
              <mat-form-field
                ><mat-label>Fecha</mat-label><input matInput type="date" [(ngModel)]="nuevo.fechaProgramada"
              /></mat-form-field>
              <mat-form-field><mat-label>Taller</mat-label><input matInput [(ngModel)]="nuevo.taller" /></mat-form-field>
            </div>
            <mat-form-field class="ancho"
              ><mat-label>Descripción</mat-label><input matInput [(ngModel)]="nuevo.descripcion"
            /></mat-form-field>
            <mat-form-field class="ancho"
              ><mat-label>Checklist (una línea por ítem)</mat-label><textarea matInput rows="4" [(ngModel)]="nuevo.checklist"></textarea>
            </mat-form-field>
            <div class="fila-acciones">
              <button mat-flat-button (click)="programar(u.unidadId)" [disabled]="enviando()">
                <mat-icon>event_available</mat-icon>Programar
              </button>
              <button mat-button (click)="programando.set(false)" [disabled]="enviando()">Cancelar</button>
            </div>
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
            @if (m.estado === 'EN_CURSO' && sesion.tiene('jefe_flota')) {
              @for (i of cierres[m.mantenimientoId] ?? []; track i.item) {
                <mat-checkbox [(ngModel)]="i.ok">{{ i.item }}</mat-checkbox>
              }
              <div class="fila-acciones">
                @if (u.tipoUnidad === 'TRACTO') {
                  <mat-form-field
                    ><mat-label>Kilometraje</mat-label><input matInput type="number" [(ngModel)]="km[m.mantenimientoId]"
                  /></mat-form-field>
                }
                <mat-form-field class="ancho"
                  ><mat-label>Observaciones</mat-label><input matInput [(ngModel)]="observaciones[m.mantenimientoId]"
                /></mat-form-field>
                <button mat-flat-button (click)="cerrar(m.mantenimientoId)" [disabled]="enviando()">
                  <mat-icon>lock</mat-icon>Cerrar mantenimiento
                </button>
              </div>
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
  readonly campos = { unidad: 'Flota', mantenimientos: 'Flota' };
  readonly puedeProgramar = puedeProgramar;
  readonly vigencia = (venceEl: string) => vigencia(venceEl);
  readonly documentosEnAviso = documentosEnAviso;
  readonly avisoKm = AVISO_KM;
  /** El formulario de programar se abre desde la acción del encabezado. */
  readonly programando = signal(false);
  readonly mantenimientos = computed(() => {
    const lista = this.fachada.mantenimientos();
    for (const m of lista) this.cierres[m.mantenimientoId] ??= cierreInicial(m);
    return lista;
  });
  readonly enviando = signal(false);
  nuevo: NuevoMantenimiento = {
    tipo: 'PREVENTIVO',
    fechaProgramada: fechaLaPaz(),
    taller: '',
    descripcion: '',
    checklist: CHECKLIST_POR_DEFECTO,
  };
  cierres: Record<string, ItemCierre[]> = {};
  km: Record<string, number> = {};
  observaciones: Record<string, string> = {};

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  async programar(unidadId: string) {
    if (await this.enviar(() => this.fachada.programar(unidadId, this.nuevo), 'Mantenimiento programado')) this.programando.set(false);
  }

  cerrar(mantenimientoId: string) {
    const cierre = {
      kilometraje: this.km[mantenimientoId],
      checklist: this.cierres[mantenimientoId],
      observaciones: this.observaciones[mantenimientoId] || undefined,
    };
    return this.enviar(() => this.fachada.cerrar(mantenimientoId, cierre), 'Mantenimiento cerrado');
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
