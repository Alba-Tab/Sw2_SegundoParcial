import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  Campo,
  Encabezado,
  errorPeriodo,
  Esqueleto,
  listoParaEnviar,
  mensajeDe,
  Sesion,
  TablaReporte,
  textoError,
  type Resultado,
  Panel,
} from 'ui-comun';
import type { FormatoExportacion, ReporteId, ReporteParams } from '../../graphql/generado';
import { paramsLimpios, paramsPorDefecto, usaParametro } from '../domain/reporte';
import { ReportesFachada } from '../reportes.fachada';

/**
 * Los 5 reportes del catálogo con botones (spec 015): sin LLM ni MCP, `reporte(id, params)` va directo a Analítica.
 * Se pueden elegir las columnas (D111; sin elegir, salen todas). "Exportar a Excel" o "a PDF" (D110) pide un enlace HMAC
 * al Gateway (D21) con una clave nueva por clic. La página abre con el primer
 * reporte que el rol puede ver (el catálogo pone primero lo que pide acción: cobranza, riesgo), no con un lienzo vacío (JV-5).
 */
@Component({
  selector: 'app-reportes',
  providers: [ReportesFachada],
  imports: [
    Panel,
    Encabezado,
    ReactiveFormsModule,
    Campo,
    Esqueleto,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TablaReporte,
    AvisoServicios,
  ],
  template: `
    <cc-encabezado titulo="Reportes" />
    @if (cargandoCatalogo()) {
      <cc-esqueleto [filas]="2" />
    }
    <cc-aviso-servicios
      [error]="errorCatalogo()"
      [campos]="campos"
      [sinDatos]="!catalogo()?.catalogoReportes"
      [reintentar]="recargarCatalogo"
    />
    <div class="catalogo">
      @for (r of permitidos(); track r.reporteId) {
        <button
          mat-stroked-button
          [class.elegido]="r.reporteId === elegido()"
          [attr.aria-pressed]="r.reporteId === elegido()"
          (click)="elegir(r.reporteId)"
          [title]="r.descripcion"
        >
          {{ r.titulo }}
        </button>
      }
    </div>
    @if (definicion(); as d) {
      <p class="secundario">{{ d.descripcion }}</p>
    }
    @if (elegido(); as id) {
      <cc-panel class="parametros">
        <form class="fila-acciones" [formGroup]="params" (ngSubmit)="ver(formParams)" #formParams novalidate>
          @if (definicion()?.maxDias) {
            <mat-form-field>
              <mat-label>Desde</mat-label>
              <input matInput type="date" formControlName="desde" />
              <mat-error>{{ textoError(params.controls.desde) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Hasta</mat-label>
              <input matInput type="date" formControlName="hasta" />
              <mat-error>{{ textoError(params.controls.hasta) }}</mat-error>
            </mat-form-field>
          }
          @if (usa('clienteId')) {
            <mat-form-field>
              <mat-label>Cliente</mat-label>
              <mat-select formControlName="clienteId">
                <mat-option [value]="null">Todos</mat-option>
                @for (c of catalogo()?.clientes?.items ?? []; track c.clienteId) {
                  <mat-option [value]="c.clienteId">{{ c.razonSocial }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @if (usa('rutaId')) {
            <mat-form-field>
              <mat-label>Ruta</mat-label>
              <mat-select formControlName="rutaId">
                <mat-option [value]="null">Todas</mat-option>
                @for (r of catalogo()?.rutas ?? []; track r.rutaId) {
                  <mat-option [value]="r.rutaId">{{ r.nombre }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @if (usa('placa')) {
            <mat-form-field>
              <mat-label>Placa</mat-label>
              <input matInput formControlName="placa" placeholder="4521KTR" />
            </mat-form-field>
          }
          @if (usa('umbral')) {
            <mat-form-field>
              <mat-label>Umbral</mat-label>
              <input matInput type="number" min="0.5" max="0.95" step="0.05" formControlName="umbral" />
              <mat-hint>De 0,5 a 0,95</mat-hint>
              <mat-error>{{ textoError(params.controls.umbral) }}</mat-error>
            </mat-form-field>
          }
          @if (usa('agrupar')) {
            <mat-form-field>
              <mat-label>Agrupar</mat-label>
              <mat-select formControlName="agrupar"
                ><mat-option value="VIAJE">Por viaje</mat-option><mat-option value="RUTA">Por ruta</mat-option></mat-select
              >
            </mat-form-field>
          }
          <mat-form-field class="columnas">
            <mat-label>Columnas</mat-label>
            <mat-select formControlName="columnas" multiple placeholder="Todas">
              @for (c of definicion()?.columnas ?? []; track c.clave) {
                <mat-option [value]="c.clave">{{ c.titulo }}</mat-option>
              }
            </mat-select>
            <mat-hint>Sin elegir, salen todas</mat-hint>
          </mat-form-field>
          <button mat-flat-button type="submit">Ver</button>
          @if (mostrado) {
            <button mat-stroked-button type="button" (click)="exportar('EXCEL')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>Exportar a Excel
            </button>
            <button mat-stroked-button type="button" (click)="exportar('PDF')" [disabled]="exportando()">
              <mat-icon>download</mat-icon>Exportar a PDF
            </button>
          }
        </form>
      </cc-panel>
    }
    @if (cargando()) {
      <cc-esqueleto [filas]="6" />
    }
    @if (error(); as e) {
      <p class="no-disponible" role="alert">{{ e }}</p>
      <button mat-stroked-button (click)="ver()"><mat-icon>replay</mat-icon>Reintentar</button>
    }
    @if (resultado(); as r) {
      <h2>{{ r.titulo }}</h2>
      <cc-tabla-reporte [resultado]="r" />
    }
  `,
  styles: `
    .catalogo {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    /* P12: en el teléfono los reportes van en una fila que se desplaza, no cinco filas antes de los parámetros. */
    @media (max-width: 599px) {
      .catalogo {
        flex-wrap: nowrap;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        padding-bottom: 4px;
      }
      .catalogo button {
        flex: none;
      }
    }
    .elegido {
      background: var(--mat-sys-secondary-container);
    }
    .parametros {
      margin-bottom: 16px;
    }
    .columnas {
      min-width: 220px;
    }
  `,
})
export class ReportesPagina {
  private readonly fachada = inject(ReportesFachada);
  private readonly avisos = inject(MatSnackBar);
  private readonly sesion = inject(Sesion);

  readonly catalogo = this.fachada.catalogo;
  readonly recargarCatalogo = () => this.fachada.recargarCatalogo();
  readonly errorCatalogo = this.fachada.errorCatalogo;
  readonly cargandoCatalogo = this.fachada.cargandoCatalogo;
  /** Quién responde cada campo del catálogo: los clientes y rutas vienen de Viajes. */
  readonly campos = { catalogoReportes: 'Analítica', clientes: 'Viajes', rutas: 'Viajes' };
  readonly permitidos = computed(() =>
    (this.catalogo()?.catalogoReportes ?? []).filter((r) => r.roles.some((rol) => this.sesion.tiene(rol))),
  );
  readonly elegido = signal<ReporteId | null>(null);
  readonly definicion = computed(() => this.catalogo()?.catalogoReportes?.find((r) => r.reporteId === this.elegido()));
  readonly resultado = signal<Resultado | null>(null);
  readonly cargando = signal(false);
  readonly exportando = signal(false);
  readonly error = signal<string | null>(null);
  readonly textoError = textoError;
  readonly params = new FormGroup({
    desde: new FormControl<string | null>(null),
    hasta: new FormControl<string | null>(
      null,
      (c) => errorPeriodo(c.parent?.get('desde')?.value, c.value, this.definicion()?.maxDias) ?? null,
    ),
    clienteId: new FormControl<string | null>(null),
    rutaId: new FormControl<string | null>(null),
    placa: new FormControl<string | null>(null),
    umbral: new FormControl<number | null>(null, [Validators.min(0.5), Validators.max(0.95)]),
    agrupar: new FormControl<string | null>(null),
    /** Sin campo en pantalla: cuentas por cobrar siempre incluye lo vencido (NG-2), aunque se cambien las fechas. */
    incluirVencidas: new FormControl<boolean | null>(null),
    /** D111: en el orden del catálogo; vacío = todas. */
    columnas: new FormControl<string[] | null>(null),
  });
  /** El reporte y los parámetros del resultado que se ve: "Exportar" usa estos, no lo que se editó después sin "Ver". */
  mostrado: { id: ReporteId; params: ReporteParams } | null = null;

  constructor() {
    effect(() => {
      const primero = this.permitidos()[0]?.reporteId;
      if (primero && !untracked(this.elegido)) untracked(() => this.elegir(primero));
    });
  }

  usa(campo: string): boolean {
    return usaParametro(this.definicion()?.parametros, campo);
  }

  elegir(id: ReporteId): void {
    this.elegido.set(id);
    this.resultado.set(null);
    this.mostrado = null;
    const p = paramsPorDefecto(id);
    this.params.reset({
      desde: p.desde ?? null,
      hasta: p.hasta ?? null,
      umbral: p.umbral ?? null,
      agrupar: p.agrupar ?? null,
      incluirVencidas: p.incluirVencidas ?? null,
      columnas: null,
    });
    void this.ver();
  }

  /** Con `raiz` (el formulario), un error marca los campos y enfoca el primero; sin ella, solo no consulta. */
  async ver(raiz?: HTMLElement): Promise<void> {
    const id = this.elegido();
    this.params.controls.hasta.updateValueAndValidity();
    if (!id || (raiz ? !listoParaEnviar(this.params, raiz) : this.params.invalid)) return;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const params = paramsLimpios(this.params.getRawValue() as ReporteParams);
      const resultado = await this.fachada.consultar(id, params);
      this.resultado.set(resultado);
      this.mostrado = resultado ? { id, params } : null;
    } catch (e) {
      this.resultado.set(null);
      this.mostrado = null;
      this.error.set(mensajeDe(e));
    } finally {
      this.cargando.set(false);
    }
  }

  async exportar(formato: FormatoExportacion): Promise<void> {
    if (!this.mostrado) return;
    const { id, params } = this.mostrado;
    this.exportando.set(true);
    try {
      const url = await this.fachada.exportar(id, params, formato);
      if (url) window.location.assign(url);
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.exportando.set(false);
    }
  }
}
