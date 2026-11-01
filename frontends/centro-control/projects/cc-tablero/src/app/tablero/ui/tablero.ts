import { Component, computed, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AvisoServicios, BobPipe, CONFIG_CENTRO, conDesde, Encabezado, Esqueleto, Estado, FechaPipe, pct, Sesion } from 'ui-comun';
import { conPendientes, pendientes, type EstadoTarjeta, type Pendiente } from '../domain/tablero';
import { TableroFachada } from '../tablero.fachada';

/**
 * Tablero (spec 016, paso 10; U7): primero lo que pide acción, como lista con enlaces a la app que lo resuelve; después
 * las cifras del periodo en una franja compacta y el detalle. Compone Viajes, Flota, Finanzas y Analítica en una
 * consulta: si un servicio cae, solo su bloque dice "no disponible" (FR1, FR2). Cada rol ve solo sus bloques.
 */
@Component({
  selector: 'app-tablero',
  providers: [TableroFachada],
  imports: [MatButtonToggleModule, MatIconModule, Encabezado, Esqueleto, BobPipe, FechaPipe, Estado, AvisoServicios],
  template: `
    <cc-encabezado titulo="Tablero" [subtitulo]="bloques.verAlertas && datosAl() ? 'Datos al ' + datosAl() : undefined">
      <mat-button-toggle-group [value]="periodo()" (change)="periodo.set($event.value)" aria-label="Periodo de las cifras">
        <mat-button-toggle value="HOY">Hoy</mat-button-toggle>
        <mat-button-toggle value="ESTA_SEMANA">Esta semana</mat-button-toggle>
        <mat-button-toggle value="ESTE_MES">Este mes</mat-button-toggle>
      </mat-button-toggle-group>
    </cc-encabezado>
    @let t = datos()?.data?.tablero;
    @if (cargando() && !t) {
      <cc-esqueleto [filas]="6" />
    }
    <!-- Los servicios caídos los avisa cada bloque; aquí solo el error que deja al tablero entero sin datos. -->
    <cc-aviso-servicios [error]="datos()?.error" [datosAl]="datos()?.datosAl" [sinDatos]="!t && !cargando()" />

    @if (t) {
      @if (conPendientes(bloques)) {
        <section aria-labelledby="titulo-pendientes">
          <h2 id="titulo-pendientes">Pide acción</h2>
          <ul class="pendientes">
            @for (p of lista(); track p.clave) {
              <li [attr.data-tono]="p.tono">
                <mat-icon>{{ p.icono }}</mat-icon>
                <span class="texto">
                  @if (p.app) {
                    <a [href]="enlace(p)">{{ p.texto }}</a>
                  } @else {
                    <span class="titulo">{{ p.texto }}</span>
                  }
                  @if (p.detalle) {
                    <span class="detalle">{{ p.detalle }}</span>
                  }
                </span>
              </li>
            } @empty {
              <li data-tono="exito">
                <mat-icon>check_circle</mat-icon><span class="texto"><span class="titulo">Nada pide acción ahora.</span></span>
              </li>
            }
          </ul>
        </section>
      }

      <section aria-labelledby="titulo-cifras">
        <h2 id="titulo-cifras">Cifras del periodo</h2>
        <dl class="cifras">
          @if (bloques.verViajes) {
            <div>
              <dt>Viajes en curso</dt>
              <dd>
                @switch (estado('viajesEnCurso')) {
                  @case ('no-disponible') {
                    <span class="no-disponible">Viajes no disponible</span>
                  }
                  @case ('sin-acceso') {
                    <span class="no-disponible">Sin acceso</span>
                  }
                  @default {
                    {{ t.viajesEnCurso?.length ?? 'Sin dato' }}
                  }
                }
              </dd>
            </div>
          }
          @if (bloques.verAlertas) {
            <div>
              <dt>Alertas abiertas</dt>
              <dd>
                @switch (estado('alertasAbiertas')) {
                  @case ('no-disponible') {
                    <span class="no-disponible">Analítica no disponible</span>
                  }
                  @case ('sin-acceso') {
                    <span class="no-disponible">Sin acceso</span>
                  }
                  @default {
                    {{ t.alertasAbiertas ?? 'Sin dato' }}
                  }
                }
              </dd>
            </div>
          }
          @if (bloques.verCobranza) {
            <div>
              <dt>Cuentas por cobrar</dt>
              <dd>
                @switch (estado('cuentasPorCobrar')) {
                  @case ('no-disponible') {
                    <span class="no-disponible">Finanzas no disponible</span>
                  }
                  @case ('sin-acceso') {
                    <span class="no-disponible">Sin acceso</span>
                  }
                  @default {
                    @if (t.cuentasPorCobrar; as c) {
                      {{ c.saldoTotal | bob }}
                      <span class="secundario">· {{ c.facturasPorVencer }} por vencer · {{ c.facturasVencidas }} vencidas</span>
                    } @else {
                      Sin dato
                    }
                  }
                }
              </dd>
            </div>
          }
          @if (bloques.verUnidades) {
            <div class="completo">
              <dt>Unidades por estado</dt>
              <dd class="unidades">
                @switch (estado('unidadesPorEstado')) {
                  @case ('no-disponible') {
                    <span class="no-disponible">Flota no disponible</span>
                  }
                  @case ('sin-acceso') {
                    <span class="no-disponible">Sin acceso</span>
                  }
                  @default {
                    @for (u of t.unidadesPorEstado ?? []; track u.estado) {
                      <span><cc-estado grupo="EstadoUnidad" [valor]="u.estado" /> {{ u.cantidad }}</span>
                    }
                  }
                }
              </dd>
            </div>
          }
        </dl>
      </section>

      @if (bloques.verViajes && !estado('viajesEnCurso') && t.viajesEnCurso?.length) {
        <h2>Viajes en curso</h2>
        <ul class="lineas">
          @for (v of t.viajesEnCurso; track v.viajeId) {
            <li>
              <a [href]="enlaceViaje(v.viajeId)">{{ v.placa ?? 'Sin unidad' }}</a>
              · {{ v.cliente?.razonSocial }} · {{ v.ruta?.nombre }}
              @if (v.riesgo?.enRiesgo) {
                <cc-estado grupo="Riesgo" valor="EN_RIESGO" /> {{ pct(v.riesgo.probabilidad) }}
              }
            </li>
          }
        </ul>
      }
      @if (bloques.verCobranza && !estado('cuentasPorCobrar') && t.cuentasPorCobrar?.proximas?.length) {
        <h2>Próximas a vencer</h2>
        <ul class="lineas">
          @for (f of t.cuentasPorCobrar.proximas; track f.facturaId) {
            <li>
              <a class="sin-corte" [href]="enlaceFactura(f.facturaId)">{{ f.numero }}</a> · {{ f.razonSocial }} · {{ f.saldo | bob }} ·
              vence
              {{ f.venceEl | fecha }}
            </li>
          }
        </ul>
      }
    }
  `,
  styles: `
    h2 {
      margin-top: 24px;
    }
    .pendientes,
    .lineas {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .pendientes li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      min-height: 44px;
      box-sizing: border-box;
      border-radius: var(--mat-sys-corner-medium, 12px);
      background: var(--mat-sys-surface-container);
    }
    .pendientes li + li {
      margin-top: 8px;
    }
    .pendientes li[data-tono='error'] {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .pendientes li[data-tono='aviso'] {
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    .pendientes li[data-tono='exito'] {
      background: var(--mat-sys-exito-container);
      color: var(--mat-sys-on-exito-container);
    }
    .pendientes .texto {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pendientes a,
    .pendientes .titulo {
      font: var(--mat-sys-title-medium);
      color: inherit;
    }
    .pendientes a {
      text-decoration: underline;
      text-underline-offset: 3px;
      padding: 10px 0;
      margin: -10px 0;
    }
    .pendientes .detalle {
      font: var(--mat-sys-body-medium);
    }
    .cifras {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 40px;
      margin: 0;
    }
    .cifras dt {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .cifras dd {
      margin: 4px 0 0;
      font: var(--mat-sys-title-large);
    }
    .cifras .completo {
      flex-basis: 100%;
    }
    .cifras .unidades {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      font: var(--mat-sys-body-large);
    }
    .lineas li {
      padding: 6px 0;
      min-height: 32px;
    }
    .lineas a {
      display: inline-block;
      min-height: 24px;
      padding: 10px 0;
      margin: -10px 0;
    }
  `,
})
export class TableroPagina {
  private readonly fachada = inject(TableroFachada);
  readonly config = inject(CONFIG_CENTRO);
  private readonly fecha = new FechaPipe();
  readonly periodo = this.fachada.periodo;
  readonly pct = pct;
  readonly datos = this.fachada.datos;
  readonly cargando = this.fachada.cargando;
  readonly bloques = this.fachada.bloques;
  readonly conPendientes = conPendientes;
  private readonly puedeAtender = inject(Sesion).tiene('despachador', 'jefe_flota', 'administracion');
  readonly lista = computed(() => pendientes(this.datos()?.data?.tablero, this.bloques, (c) => this.fachada.estado(c), this.puedeAtender));
  readonly datosAl = computed(() => {
    const al = this.datos()?.data?.tablero?.datosAl;
    return al ? this.fecha.transform(al, true) : undefined;
  });

  estado(campo: string): EstadoTarjeta {
    return this.fachada.estado(campo);
  }

  /** Hacia otra app con `?desde=cc-tablero`, para que ofrezca volver aquí (N3). */
  enlace(p: Pendiente): string {
    return conDesde(this.config.urls[p.app!] + p.ruta, this.config.app);
  }

  enlaceViaje(id: string | undefined): string {
    return conDesde(`${this.config.urls['cc-operaciones']}/viajes/${id}`, this.config.app);
  }

  enlaceFactura(id: string | undefined): string {
    return conDesde(`${this.config.urls['cc-finanzas']}/facturas/${id}`, this.config.app);
  }
}
