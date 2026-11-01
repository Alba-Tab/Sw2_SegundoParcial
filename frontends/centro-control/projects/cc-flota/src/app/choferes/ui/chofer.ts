import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { AvisoServicios, Encabezado, Estado, FechaPipe, Esqueleto } from 'ui-comun';
import { PUNTAJE_BAJO } from '../../conduccion/domain/conduccion';
import { ChoferFachada } from '../choferes.fachada';
import { estadoChofer, vigenciaLicencia } from '../domain/chofer';

/** Ficha de un chofer (G3): licencia, estado y su conducción de la semana (D84). */
@Component({
  selector: 'app-chofer',
  providers: [ChoferFachada],
  imports: [Esqueleto, Encabezado, Estado, FechaPipe, DecimalPipe, AvisoServicios],
  template: `
    @let titulo = chofer()?.nombre ?? 'Chofer';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Choferes', ruta: '/choferes' }, { texto: titulo }]">
      @if (chofer(); as c) {
        <cc-estado grupo="EstadoChofer" [valor]="estado(c)" />
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!chofer()" />
    @if (chofer(); as c) {
      <dl class="datos">
        <div>
          <dt>Licencia</dt>
          <dd>Categoría {{ c.licenciaCategoria }}</dd>
        </div>
        <div>
          <dt>Licencia vence</dt>
          <dd>{{ c.licenciaVenceEl | fecha }} <cc-estado grupo="Vigencia" [valor]="vigencia()" /></dd>
        </div>
      </dl>

      <h2>Conducción de la semana</h2>
      @if (puntajes(); as p) {
        @if (resumen(); as r) {
          <dl class="datos">
            <div>
              <dt>Puntaje</dt>
              <dd [class.no-disponible]="r.puntaje < puntajeBajo">{{ r.puntaje | number: '1.0-1' }}</dd>
            </div>
            <div>
              <dt>Kilómetros</dt>
              <dd>{{ r.km | number: '1.0-0' }} km</dd>
            </div>
            <div>
              <dt>Frenadas bruscas</dt>
              <dd>{{ r.frenadas }}</dd>
            </div>
            <div>
              <dt>Alertas de fatiga</dt>
              <dd>{{ r.fatigas }}</dd>
            </div>
          </dl>
          <h3>Viajes</h3>
          <ul>
            @for (v of p.viajes; track v.viajeId) {
              <li>Viaje {{ v.viajeId?.slice(0, 8) }}: puntaje {{ v.puntaje | number: '1.0-1' }}, {{ v.km | number: '1.0-0' }} km</li>
            } @empty {
              <li class="secundario">Sin viajes en el periodo.</li>
            }
          </ul>
        } @else {
          <p class="secundario">Sin viajes del {{ p.desde | fecha }} al {{ p.hasta | fecha }}.</p>
        }
      }
    } @else if (cargado()) {
      <p class="secundario">No se encontró ese chofer. Vuelve a la lista de choferes.</p>
    }
  `,
})
export class ChoferPagina {
  private readonly fachada = inject(ChoferFachada);
  readonly id = input.required<string>();
  readonly chofer = this.fachada.chofer;
  readonly puntajes = this.fachada.puntajes;
  readonly cargado = this.fachada.cargado;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { choferes: 'Flota', puntajesConduccion: 'Analítica' };
  readonly puntajeBajo = PUNTAJE_BAJO;
  readonly estado = estadoChofer;
  readonly vigencia = computed(() => {
    const c = this.chofer();
    return c ? vigenciaLicencia(c) : undefined;
  });
  readonly resumen = computed(() => this.puntajes()?.choferes.find((x) => x.choferId === this.id()));

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }
}
