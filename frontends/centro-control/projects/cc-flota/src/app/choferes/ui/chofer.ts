import { Component, computed, effect, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AvisoServicios, Encabezado, Esqueleto, Estado, FechaPipe, LIMITE_GATEWAY, NumeroPipe } from 'ui-comun';
import { PUNTAJE_BAJO } from '../../conduccion/domain/conduccion';
import { ChoferFachada } from '../choferes.fachada';
import { estadoChofer, vigenciaLicencia } from '../domain/chofer';

/** Ficha de un chofer (G3): licencia, estado y su conducción de la semana (D84). */
@Component({
  selector: 'app-chofer',
  providers: [ChoferFachada],
  imports: [MatIconModule, Esqueleto, Encabezado, Estado, FechaPipe, NumeroPipe, AvisoServicios, RouterLink],
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
    <cc-aviso-servicios
      buscado="este chofer"
      [error]="error()"
      [campos]="campos"
      [sinDatos]="!chofer()"
      [sinResultado]="(cargado() || !idValido()) && !listaTruncada()"
    />
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
              <dt>Puntaje (0 a 100)</dt>
              <dd [class.no-disponible]="r.puntaje < puntajeBajo">
                @if (r.puntaje < puntajeBajo) {
                  <mat-icon class="icono-en-linea">warning</mat-icon>
                }
                {{ r.puntaje | numero: 1 }}
                @if (r.puntaje < puntajeBajo) {
                  <span class="cdk-visually-hidden">, bajo {{ puntajeBajo }}</span>
                }
              </dd>
            </div>
            <div>
              <dt>Kilómetros</dt>
              <dd>{{ r.km | numero: 0 }} km</dd>
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
              <li>
                Viaje {{ $index + 1 }}: puntaje {{ v.puntaje | numero: 1 }}, {{ v.km | numero: 0 }} km, {{ v.frenadas }}
                {{ v.frenadas === 1 ? 'frenada brusca' : 'frenadas bruscas' }}
              </li>
            } @empty {
              <li class="secundario">Sin viajes en el periodo.</li>
            }
          </ul>
        } @else {
          <p class="secundario">Sin viajes del {{ p.desde | fecha }} al {{ p.hasta | fecha }}.</p>
        }
      }
    } @else if (listaTruncada()) {
      <!-- El «no encontrado» lo dice cc-aviso-servicios; aquí solo el caso de la lista cortada (D-2). -->
      <p class="secundario">
        Ese chofer no está entre los primeros {{ limite }} que lee el Centro de Control. Vuelve a la
        <a routerLink="/choferes">lista de choferes</a>.
      </p>
    }
  `,
})
export class ChoferPagina {
  private readonly fachada = inject(ChoferFachada);
  readonly id = input.required<string>();
  readonly chofer = this.fachada.chofer;
  readonly puntajes = this.fachada.puntajes;
  readonly cargado = this.fachada.cargado;
  readonly idValido = this.fachada.idValido;
  readonly listaTruncada = this.fachada.listaTruncada;
  readonly limite = LIMITE_GATEWAY;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { choferes: 'Flota', puntajesConduccion: { servicio: 'Analítica', que: 'el puntaje de conducción' } };
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
