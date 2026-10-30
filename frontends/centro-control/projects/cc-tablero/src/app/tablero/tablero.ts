import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { BobPipe, CONFIG_CENTRO, FechaPipe, pct, servicioCaido } from 'ui-comun';
import { TableroGQL, type Periodo } from '../graphql/generado';

/**
 * Tablero del gerente (spec 016, paso 10): compone Viajes, Flota, Finanzas y Analítica en una consulta. Si un servicio
 * cae, solo su tarjeta dice "no disponible" (FR1, FR2).
 */
@Component({
  selector: 'app-tablero',
  imports: [MatCardModule, MatButtonToggleModule, MatProgressBarModule, MatIconModule, RouterLink, BobPipe, FechaPipe],
  template: `
    <div class="encabezado">
      <h1>Tablero</h1>
      <mat-button-toggle-group [value]="periodo()" (change)="periodo.set($event.value)" aria-label="Periodo">
        <mat-button-toggle value="HOY">Hoy</mat-button-toggle>
        <mat-button-toggle value="ESTA_SEMANA">Esta semana</mat-button-toggle>
        <mat-button-toggle value="ESTE_MES">Este mes</mat-button-toggle>
      </mat-button-toggle-group>
      <span class="enlace"
        ><a routerLink="/reportes">Reportes</a> · <a routerLink="/voz">Pregunta por voz</a> · <a routerLink="/agente">Agente</a></span
      >
    </div>
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @let t = datos()?.data?.tablero;
    <p class="secundario">Datos al {{ t?.datosAl ? (t?.datosAl | fecha: true) : '—' }}</p>
    <div class="tarjetas">
      <mat-card>
        <mat-card-header><mat-card-title>Viajes en curso</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (caido('viajesEnCurso')) {
            <p class="no-disponible">Viajes no disponible</p>
          } @else {
            <p class="cifra">{{ t?.viajesEnCurso?.length ?? '—' }}</p>
            @for (v of t?.viajesEnCurso ?? []; track v.viajeId) {
              <p class="linea">
                <a [href]="config.urls['cc-operaciones'] + '/viajes/' + v.viajeId">{{ v.placa }}</a>
                · {{ v.cliente?.razonSocial }} · {{ v.ruta?.nombre }}
                @if (v.riesgo?.enRiesgo) {
                  <span class="chip-estado" data-alerta="true">riesgo {{ pct(v.riesgo?.probabilidad) }}</span>
                }
              </p>
            }
          }
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Unidades por estado</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (caido('unidadesPorEstado')) {
            <p class="no-disponible">Flota no disponible</p>
          } @else {
            @for (u of t?.unidadesPorEstado ?? []; track u.estado) {
              <p class="linea">
                <span class="chip-estado">{{ u.estado }}</span> {{ u.cantidad }}
              </p>
            }
          }
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Cuentas por cobrar</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (caido('cuentasPorCobrar')) {
            <p class="no-disponible">Finanzas no disponible</p>
          } @else if (t?.cuentasPorCobrar; as c) {
            <p class="cifra">{{ c.saldoTotal | bob }}</p>
            <p class="secundario">{{ c.facturasPorVencer }} por vencer · {{ c.facturasVencidas }} vencidas</p>
            @for (f of c.proximas; track f.facturaId) {
              <p class="linea">{{ f.numero }} · {{ f.razonSocial }} · {{ f.saldo | bob }} · vence {{ f.venceEl | fecha }}</p>
            }
          }
        </mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Alertas abiertas</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (caido('alertasAbiertas')) {
            <p class="no-disponible">Analítica no disponible</p>
          } @else {
            <p class="cifra">{{ t?.alertasAbiertas ?? '—' }}</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .encabezado {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .encabezado h1 {
      margin: 0;
    }
    .enlace {
      margin-left: auto;
    }
    .cifra {
      font: var(--mat-sys-display-small);
      margin: 8px 0;
    }
    .linea {
      margin: 4px 0;
      font-size: 14px;
    }
  `,
})
export class TableroPagina {
  private readonly gql = inject(TableroGQL);
  readonly config = inject(CONFIG_CENTRO);
  readonly periodo = signal<Periodo>('ESTA_SEMANA');
  readonly pct = pct;
  readonly datos = toSignal(
    toObservable(this.periodo).pipe(switchMap((periodo) => this.gql.watch({ variables: { periodo }, pollInterval: 30_000 }).valueChanges)),
  );
  readonly cargando = computed(() => this.datos()?.loading ?? true);

  caido(campo: string): boolean {
    return servicioCaido(this.datos()?.error, campo);
  }
}
