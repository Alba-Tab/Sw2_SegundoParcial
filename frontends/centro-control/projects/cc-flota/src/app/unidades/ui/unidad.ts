import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AvisoServicios, fechaLaPaz, FechaPipe, mensajeDe, Sesion } from 'ui-comun';
import { CHECKLIST_POR_DEFECTO, cierreInicial, puedeProgramar, type ItemCierre, type NuevoMantenimiento } from '../domain/unidad';
import { UnidadFachada } from '../unidades.fachada';

/** Spec 010: programar un mantenimiento (la unidad pasa a EN_MANTENIMIENTO) y cerrarlo con su checklist. */
@Component({
  selector: 'app-unidad',
  providers: [UnidadFachada],
  imports: [
    FormsModule,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    FechaPipe,
    AvisoServicios,
  ],
  template: `
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!unidad()" />
    @if (unidad(); as u) {
      <h1>
        {{ u.placa }} · <span class="chip-estado">{{ u.estado }}</span>
      </h1>
      <p>
        {{ u.tipoUnidad }} {{ u.tipoRemolque ?? '' }} · {{ (u.kilometraje | number) ?? '—' }} km ·
        {{ u.kmDesdeUltimoMantenimiento | number }} km desde el último mantenimiento
      </p>
      <p class="secundario">
        @for (d of u.documentos; track d.tipo) {
          {{ d.tipo }} vence {{ d.venceEl | fecha }} ·
        }
      </p>

      @if (sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
        <mat-card class="formulario">
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
            <button mat-flat-button (click)="programar(u.unidadId)" [disabled]="enviando()">Programar</button>
          </mat-card-content>
        </mat-card>
      }

      <h2>Mantenimientos</h2>
      @for (m of mantenimientos(); track m.mantenimientoId) {
        <mat-card class="mantenimiento">
          <mat-card-header>
            <mat-card-title>{{ m.tipo }} · {{ m.fechaProgramada | fecha }} · {{ m.taller }}</mat-card-title>
            <mat-card-subtitle
              ><span class="chip-estado">{{ m.estado }}</span> {{ m.descripcion }}</mat-card-subtitle
            >
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
                <button mat-flat-button (click)="cerrar(m.mantenimientoId)" [disabled]="enviando()">Cerrar mantenimiento</button>
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

  programar(unidadId: string) {
    return this.enviar(() => this.fachada.programar(unidadId, this.nuevo), 'Mantenimiento programado');
  }

  cerrar(mantenimientoId: string) {
    const cierre = {
      kilometraje: this.km[mantenimientoId],
      checklist: this.cierres[mantenimientoId],
      observaciones: this.observaciones[mantenimientoId] || undefined,
    };
    return this.enviar(() => this.fachada.cerrar(mantenimientoId, cierre), 'Mantenimiento cerrado');
  }

  private async enviar(accion: () => Promise<unknown>, ok: string): Promise<void> {
    this.enviando.set(true);
    try {
      await accion();
      this.avisos.open(ok, undefined, { duration: 4000 });
      await this.fachada.recargar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
