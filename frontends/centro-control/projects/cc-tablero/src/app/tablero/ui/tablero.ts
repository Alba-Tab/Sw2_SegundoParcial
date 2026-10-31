import { Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AvisoServicios, BobPipe, CONFIG_CENTRO, FechaPipe, pct } from 'ui-comun';
import { TableroFachada } from '../tablero.fachada';

/**
 * Tablero del gerente (spec 016, paso 10): compone Viajes, Flota, Finanzas y Analítica en una consulta. Si un servicio
 * cae, solo su tarjeta dice "no disponible" (FR1, FR2).
 */
@Component({
  selector: 'app-tablero',
  providers: [TableroFachada],
  imports: [MatCardModule, MatButtonToggleModule, MatProgressBarModule, MatIconModule, RouterLink, BobPipe, FechaPipe, AvisoServicios],
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
    <!-- Los servicios caídos los avisa cada tarjeta; aquí solo el error que deja al tablero entero sin datos. -->
    <cc-aviso-servicios [error]="datos()?.error" [sinDatos]="!t && !cargando()" />
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
                  <span class="chip-estado" data-alerta="true">riesgo {{ pct(v.riesgo.probabilidad) }}</span>
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
  private readonly fachada = inject(TableroFachada);
  readonly config = inject(CONFIG_CENTRO);
  readonly periodo = this.fachada.periodo;
  readonly pct = pct;
  readonly datos = this.fachada.datos;
  readonly cargando = this.fachada.cargando;

  caido(campo: string): boolean {
    return this.fachada.caido(campo);
  }
}
