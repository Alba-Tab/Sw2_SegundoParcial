import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, map } from 'rxjs';
import { Intentos, mensajeDe, Sesion, TablaReporte, type Resultado } from 'ui-comun';
import { CatalogoGQL, ExportarReporteGQL, ReporteGQL, type ReporteId, type ReporteParams } from '../graphql/generado';

const hoy = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const dias = (n: number) => new Date(Date.now() - 4 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Los 5 reportes del catálogo con botones (spec 015): sin LLM ni MCP, `reporte(id, params)` va directo a Analítica.
 * "Exportar a Excel" pide un enlace HMAC al Gateway (D21) con una clave nueva por clic.
 */
@Component({
  selector: 'app-reportes',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    TablaReporte,
  ],
  template: `
    <h1>Reportes</h1>
    <div class="catalogo">
      @for (r of permitidos(); track r.reporteId) {
        <button mat-stroked-button [class.elegido]="r.reporteId === elegido()" (click)="elegir(r.reporteId)" [title]="r.descripcion">
          {{ r.titulo }}
        </button>
      }
    </div>
    @if (elegido(); as id) {
      <mat-card class="parametros">
        <mat-card-content>
          <div class="fila-acciones">
            @if (definicion()?.maxDias) {
              <mat-form-field><mat-label>Desde</mat-label><input matInput type="date" [(ngModel)]="params.desde" /></mat-form-field>
              <mat-form-field><mat-label>Hasta</mat-label><input matInput type="date" [(ngModel)]="params.hasta" /></mat-form-field>
            }
            @if (usa('clienteId')) {
              <mat-form-field>
                <mat-label>Cliente</mat-label>
                <mat-select [(ngModel)]="params.clienteId">
                  <mat-option [value]="undefined">Todos</mat-option>
                  @for (c of catalogo()?.clientes ?? []; track c.clienteId) {
                    <mat-option [value]="c.clienteId">{{ c.razonSocial }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            @if (usa('rutaId')) {
              <mat-form-field>
                <mat-label>Ruta</mat-label>
                <mat-select [(ngModel)]="params.rutaId">
                  <mat-option [value]="undefined">Todas</mat-option>
                  @for (r of catalogo()?.rutas ?? []; track r.rutaId) {
                    <mat-option [value]="r.rutaId">{{ r.nombre }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
            @if (usa('placa')) {
              <mat-form-field
                ><mat-label>Placa</mat-label><input matInput [(ngModel)]="params.placa" placeholder="4521KTR"
              /></mat-form-field>
            }
            @if (usa('umbral')) {
              <mat-form-field
                ><mat-label>Umbral</mat-label><input matInput type="number" min="0.5" max="0.95" step="0.05" [(ngModel)]="params.umbral"
              /></mat-form-field>
            }
            @if (usa('agrupar')) {
              <mat-form-field>
                <mat-label>Agrupar</mat-label>
                <mat-select [(ngModel)]="params.agrupar"
                  ><mat-option value="VIAJE">Por viaje</mat-option><mat-option value="RUTA">Por ruta</mat-option></mat-select
                >
              </mat-form-field>
            }
            <button mat-flat-button (click)="ver()">Ver</button>
            <button mat-stroked-button (click)="exportar()" [disabled]="!resultado() || exportando()">
              <mat-icon>download</mat-icon> Exportar a Excel
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    }
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (error()) {
      <p class="no-disponible">{{ error() }}</p>
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
    .elegido {
      background: var(--mat-sys-secondary-container);
    }
    .parametros {
      margin-bottom: 16px;
    }
  `,
})
export class ReportesPagina {
  private readonly catalogoGql = inject(CatalogoGQL);
  private readonly reporteGql = inject(ReporteGQL);
  private readonly exportarGql = inject(ExportarReporteGQL);
  private readonly avisos = inject(MatSnackBar);
  private readonly sesion = inject(Sesion);

  readonly catalogo = toSignal(this.catalogoGql.fetch().pipe(map((r) => r.data)));
  readonly permitidos = computed(() =>
    (this.catalogo()?.catalogoReportes ?? []).filter((r) => r.roles.some((rol) => this.sesion.tiene(rol))),
  );
  readonly elegido = signal<ReporteId | null>(null);
  readonly definicion = computed(() => this.catalogo()?.catalogoReportes?.find((r) => r.reporteId === this.elegido()));
  readonly resultado = signal<Resultado | null>(null);
  readonly cargando = signal(false);
  readonly exportando = signal(false);
  readonly error = signal<string | null>(null);
  params: ReporteParams = {};
  private readonly intentos = new Intentos();

  usa(campo: string): boolean {
    return campo in ((this.definicion()?.parametros as { properties?: object } | undefined)?.properties ?? {});
  }

  elegir(id: ReporteId): void {
    this.elegido.set(id);
    this.resultado.set(null);
    // Cuentas por cobrar mira vencimientos: "esta semana" hacia adelante; los demás, el último mes.
    this.params =
      id === 'CUENTAS_POR_COBRAR'
        ? { desde: hoy(), hasta: dias(6) }
        : id === 'VIAJES_EN_RIESGO'
          ? { umbral: 0.7 }
          : { desde: dias(-30), hasta: hoy() };
    if (id === 'RENTABILIDAD') this.params.agrupar = 'RUTA';
    void this.ver();
  }

  async ver(): Promise<void> {
    const id = this.elegido();
    if (!id) return;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(this.reporteGql.fetch({ variables: { id, params: this.limpios() } }));
      if (r.error) throw r.error;
      this.resultado.set((r.data?.reporte as Resultado | undefined) ?? null);
    } catch (e) {
      this.resultado.set(null);
      this.error.set(mensajeDe(e));
    } finally {
      this.cargando.set(false);
    }
  }

  async exportar(): Promise<void> {
    const id = this.elegido();
    if (!id) return;
    this.exportando.set(true);
    try {
      const params = this.limpios();
      const r = await this.intentos.enviar('exportarReporte', { id, params }, (clave) =>
        this.exportarGql.mutate({ variables: { id, params, clave } }),
      );
      const url = r.data?.exportarReporte.url;
      if (url) window.location.assign(url);
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.exportando.set(false);
    }
  }

  private limpios(): ReporteParams {
    return Object.fromEntries(Object.entries(this.params).filter(([, v]) => v !== undefined && v !== null && v !== '')) as ReporteParams;
  }
}
