import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Encabezado, sinErroresDe, AvisoServicios, BobPipe, Estado, EtiquetaPipe, FechaPipe, mensajeDe, pct, Sesion } from 'ui-comun';
import { RouterLink } from '@angular/router';
import type { OpcionIntervencion } from '../../graphql/generado';
import { ViajeFachada } from '../viajes.fachada';

/** Detalle del viaje (al que llevan las alertas): bitácora, entrega, riesgo y las decisiones del despachador. */
@Component({
  selector: 'app-viaje',
  providers: [ViajeFachada],
  imports: [
    Encabezado,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    RouterLink,
    MatProgressBarModule,
    BobPipe,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    @let r = datos();
    @if (r?.loading && !r?.data) {
      <mat-progress-bar mode="indeterminate" />
    }
    @let placa = r?.data?.viaje?.placa;
    @let titulo = placa ? 'Viaje ' + placa : 'Viaje';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Viajes', ruta: '/viajes' }, { texto: titulo }]">
      @if (r?.data?.viaje; as v) {
        <cc-estado grupo="EstadoViaje" [valor]="v.estado" />
      }
      @if (r?.data?.viaje?.estado === 'EN_RUTA') {
        <a mat-stroked-button routerLink="/mapa"><mat-icon>map</mat-icon>Ver en el mapa</a>
      }
    </cc-encabezado>
    <!-- Sin predicción (404 = null, o el campo con error) no es una falla: lo dice la sección de riesgo (W3). -->
    <cc-aviso-servicios [error]="sinErroresDe(r?.error, 'riesgo')" [campos]="campos" [sinDatos]="!r?.data?.viaje" />
    @if (r?.data?.viaje; as v) {
      <!-- Lo que pide una decisión va primero (PRODUCT.md, principio 1). -->
      @if (sesion.tiene('despachador') && v.estado === 'ENTREGA_OBSERVADA') {
        <section class="decision" aria-labelledby="titulo-decision">
          <h2 id="titulo-decision">Decidir la entrega observada</h2>
          <div class="fila-acciones">
            <mat-form-field class="ancho"
              ><mat-label>Nota o motivo (3 a 300)</mat-label><input matInput [(ngModel)]="texto"
            /></mat-form-field>
            <button mat-flat-button (click)="aprobar(id())" [disabled]="enviando()"><mat-icon>thumb_up</mat-icon>Aprobar entrega</button>
            <button mat-stroked-button (click)="rechazar(id())" [disabled]="enviando() || texto.trim().length < 3">
              <mat-icon>block</mat-icon>Rechazar (no se factura)
            </button>
          </div>
        </section>
      }
      @if (sesion.tiene('despachador') && v.estado === 'REQUIERE_INTERVENCION') {
        <section class="decision" aria-labelledby="titulo-intervencion">
          <h2 id="titulo-intervencion">Resolver la intervención</h2>
          @if (v.motivo) {
            <p>{{ v.motivo }}</p>
          }
          <div class="fila-acciones">
            <mat-form-field class="ancho"
              ><mat-label>Nota (obligatoria para marcar resuelto)</mat-label><input matInput [(ngModel)]="texto"
            /></mat-form-field>
            <button mat-flat-button (click)="resolver(id(), 'REINTENTAR_COMPENSACION')" [disabled]="enviando()">
              <mat-icon>replay</mat-icon>Reintentar la compensación
            </button>
            <button mat-stroked-button (click)="resolver(id(), 'MARCAR_RESUELTO')" [disabled]="enviando() || texto.trim().length < 3">
              <mat-icon>task_alt</mat-icon>Marcar resuelto
            </button>
          </div>
        </section>
      }

      <dl class="datos">
        <div>
          <dt>Cliente</dt>
          <dd>{{ v.cliente?.razonSocial ?? '—' }}</dd>
        </div>
        <div>
          <dt>Ruta</dt>
          <dd>{{ v.ruta?.nombre }}{{ v.ruta?.distanciaKm ? ' (' + v.ruta.distanciaKm + ' km)' : '' }}</dd>
        </div>
        <div>
          <dt>Carga</dt>
          <dd>{{ v.tipoCarga | etiqueta: 'TipoCarga' }} · {{ v.toneladas }} t</dd>
        </div>
        <div>
          <dt>Fecha del viaje</dt>
          <dd>{{ v.fechaViaje | fecha }}</dd>
        </div>
        <div>
          <dt>Chofer</dt>
          <dd>{{ v.choferNombre ?? '—' }}</dd>
        </div>
        <div>
          <dt>Unidad</dt>
          <dd>
            {{ v.unidad?.placa ?? v.placa ?? '—' }}{{ v.unidad?.estado ? ' (' + (v.unidad.estado | etiqueta: 'EstadoUnidad') + ')' : '' }}
          </dd>
        </div>
        @if (verMonto) {
          <div>
            <dt>Monto</dt>
            <dd>{{ v.monto | bob }}</dd>
          </div>
        }
        <div>
          <dt>Iniciado</dt>
          <dd>{{ v.iniciadoEn | fecha: true }}</dd>
        </div>
        <div>
          <dt>Última posición</dt>
          <dd>{{ v.ultimaPosicionEn | fecha: true }}</dd>
        </div>
      </dl>

      @if (v.riesgo; as riesgo) {
        <h2>Riesgo de retraso: {{ pct(riesgo.probabilidad) }}</h2>
        <dl class="datos">
          @for (f of riesgo.factores; track f.nombre) {
            <div>
              <dt>{{ f.nombre }}</dt>
              <dd>+{{ pct(f.aporte) }}</dd>
            </div>
          }
        </dl>
        <p class="secundario">Calculado {{ riesgo.calculadaEn | fecha: true }} · umbral {{ pct(riesgo.umbral) }}</p>
      } @else if (verRiesgo && v.estado === 'EN_RUTA') {
        <h2>Riesgo de retraso</h2>
        <p class="secundario">Aún no hay datos para estimar el retraso.</p>
      }

      @if (v.entrega; as e) {
        <h2>{{ e.tipo | etiqueta: 'TipoEntrega' }}</h2>
        <dl class="datos">
          <div>
            <dt>Registrada</dt>
            <dd>{{ e.registradaEn | fecha: true }}</dd>
          </div>
          <div>
            <dt>Geocerca</dt>
            <dd>{{ e.dentroGeocerca ? 'Dentro' : 'Fuera' }} ({{ e.distanciaMetros }} m del destino)</dd>
          </div>
          <div>
            <dt>Firma</dt>
            <dd>{{ e.conFirma ? 'Con firma de ' + e.nombreReceptor : 'Sin firma' }}</dd>
          </div>
          @if (e.razones?.length) {
            <div>
              <dt>Razones</dt>
              <dd>{{ e.razones.join(', ') }}</dd>
            </div>
          }
          @if (e.motivo) {
            <div class="completo">
              <dt>Motivo</dt>
              <dd>{{ e.motivo }}</dd>
            </div>
          }
        </dl>
      }

      <h2>Bitácora</h2>
      @for (h of v.hitos ?? []; track h.hitoId) {
        <p class="hito">
          <cc-estado grupo="TipoHito" [valor]="h.tipo" /> {{ h.registradoEn | fecha: true }} · {{ h.descripcion }}
          <span class="secundario">({{ h.origen | etiqueta: 'OrigenHito' }})</span>
        </p>
      } @empty {
        <p class="secundario">Sin hitos.</p>
      }
    } @else if (r && !r.loading && !r.error) {
      <p class="no-disponible">El viaje no existe</p>
    }
  `,
  styles: `
    .ancho {
      min-width: min(320px, 100%);
    }
    .decision {
      margin-bottom: 24px;
    }
    .decision h2 {
      margin-top: 0;
    }
    .hito {
      margin: 6px 0;
    }
  `,
})
export class ViajePagina {
  private readonly fachada = inject(ViajeFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  readonly datos = this.fachada.datos;
  readonly verMonto = this.fachada.verMonto;
  readonly verRiesgo = this.fachada.verRiesgo;
  readonly sinErroresDe = sinErroresDe;
  readonly enviando = signal(false);
  readonly pct = pct;
  readonly campos = { viaje: 'Viajes', unidad: 'Flota' };
  texto = '';

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  aprobar(viajeId: string) {
    const nota = this.texto.trim() || undefined;
    return this.enviar(() => this.fachada.aprobarEntrega(viajeId, nota), 'Entrega aprobada: se factura');
  }
  rechazar(viajeId: string) {
    const motivo = this.texto.trim();
    return this.enviar(() => this.fachada.rechazarEntrega(viajeId, motivo), 'Entrega rechazada');
  }
  resolver(viajeId: string, opcion: OpcionIntervencion) {
    const nota = this.texto.trim() || undefined;
    return this.enviar(() => this.fachada.resolverIntervencion(viajeId, opcion, nota), 'Intervención enviada');
  }

  private async enviar(accion: () => Promise<unknown>, ok: string): Promise<void> {
    this.enviando.set(true);
    try {
      await accion();
      this.texto = '';
      this.avisos.open(ok, undefined, { duration: 4000 });
      await this.fachada.recargar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
