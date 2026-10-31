import { Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AvisoServicios, BobPipe, CONFIG_CENTRO, Encabezado, Estado, FechaPipe, pct } from 'ui-comun';
import type { EstadoTarjeta } from '../domain/tablero';
import { TableroFachada } from '../tablero.fachada';

/**
 * Tablero del gerente (spec 016, paso 10): compone Viajes, Flota, Finanzas y Analítica en una consulta. Si un servicio
 * cae, solo su tarjeta dice "no disponible" (FR1, FR2). Los demás roles internos ven solo las tarjetas de su rol.
 */
@Component({
  selector: 'app-tablero',
  providers: [TableroFachada],
  imports: [
    MatCardModule,
    MatButtonToggleModule,
    MatProgressBarModule,
    MatIconModule,
    Encabezado,
    BobPipe,
    FechaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    <cc-encabezado titulo="Tablero">
      <mat-button-toggle-group [value]="periodo()" (change)="periodo.set($event.value)" aria-label="Periodo">
        <mat-button-toggle value="HOY">Hoy</mat-button-toggle>
        <mat-button-toggle value="ESTA_SEMANA">Esta semana</mat-button-toggle>
        <mat-button-toggle value="ESTE_MES">Este mes</mat-button-toggle>
      </mat-button-toggle-group>
    </cc-encabezado>
    @if (cargando()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @let t = datos()?.data?.tablero;
    <!-- Los servicios caídos los avisa cada tarjeta; aquí solo el error que deja al tablero entero sin datos. -->
    <cc-aviso-servicios [error]="datos()?.error" [sinDatos]="!t && !cargando()" />
    @if (bloques.verAlertas) {
      <p class="secundario">Datos al {{ t?.datosAl ? (t?.datosAl | fecha: true) : '—' }}</p>
    }
    <!-- Cada tarjeta solo para el rol que puede ver su bloque (domain/tablero.ts): ninguna queda en blanco. -->
    <div class="tarjetas">
      @if (bloques.verViajes) {
        <mat-card>
          <mat-card-header><mat-card-title>Viajes en curso</mat-card-title></mat-card-header>
          <mat-card-content>
            @switch (estado('viajesEnCurso')) {
              @case ('no-disponible') {
                <p class="no-disponible">Viajes no disponible</p>
              }
              @case ('sin-acceso') {
                <p class="no-disponible">Sin acceso</p>
              }
              @default {
                <p class="cifra">{{ t?.viajesEnCurso?.length ?? '—' }}</p>
                @for (v of t?.viajesEnCurso ?? []; track v.viajeId) {
                  <p class="linea">
                    <a [href]="config.urls['cc-operaciones'] + '/viajes/' + v.viajeId">{{ v.placa }}</a>
                    · {{ v.cliente?.razonSocial }} · {{ v.ruta?.nombre }}
                    @if (v.riesgo?.enRiesgo) {
                      <cc-estado grupo="Riesgo" valor="EN_RIESGO" /> {{ pct(v.riesgo.probabilidad) }}
                    }
                  </p>
                }
              }
            }
          </mat-card-content>
        </mat-card>
      }
      @if (bloques.verUnidades) {
        <mat-card>
          <mat-card-header><mat-card-title>Unidades por estado</mat-card-title></mat-card-header>
          <mat-card-content>
            @switch (estado('unidadesPorEstado')) {
              @case ('no-disponible') {
                <p class="no-disponible">Flota no disponible</p>
              }
              @case ('sin-acceso') {
                <p class="no-disponible">Sin acceso</p>
              }
              @default {
                @for (u of t?.unidadesPorEstado ?? []; track u.estado) {
                  <p class="linea"><cc-estado grupo="EstadoUnidad" [valor]="u.estado" /> {{ u.cantidad }}</p>
                }
              }
            }
          </mat-card-content>
        </mat-card>
      }
      @if (bloques.verCobranza) {
        <mat-card>
          <mat-card-header><mat-card-title>Cuentas por cobrar</mat-card-title></mat-card-header>
          <mat-card-content>
            @switch (estado('cuentasPorCobrar')) {
              @case ('no-disponible') {
                <p class="no-disponible">Finanzas no disponible</p>
              }
              @case ('sin-acceso') {
                <p class="no-disponible">Sin acceso</p>
              }
              @default {
                @if (t?.cuentasPorCobrar; as c) {
                  <p class="cifra">{{ c.saldoTotal | bob }}</p>
                  <p class="secundario">{{ c.facturasPorVencer }} por vencer · {{ c.facturasVencidas }} vencidas</p>
                  @for (f of c.proximas; track f.facturaId) {
                    <p class="linea">{{ f.numero }} · {{ f.razonSocial }} · {{ f.saldo | bob }} · vence {{ f.venceEl | fecha }}</p>
                  }
                }
              }
            }
          </mat-card-content>
        </mat-card>
      }
      @if (bloques.verAlertas) {
        <mat-card>
          <mat-card-header><mat-card-title>Alertas abiertas</mat-card-title></mat-card-header>
          <mat-card-content>
            @switch (estado('alertasAbiertas')) {
              @case ('no-disponible') {
                <p class="no-disponible">Analítica no disponible</p>
              }
              @case ('sin-acceso') {
                <p class="no-disponible">Sin acceso</p>
              }
              @default {
                <p class="cifra">{{ t?.alertasAbiertas ?? '—' }}</p>
              }
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: `
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
  readonly bloques = this.fachada.bloques;

  estado(campo: string): EstadoTarjeta {
    return this.fachada.estado(campo);
  }
}
