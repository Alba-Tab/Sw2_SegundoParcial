import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { AvisoServicios, Encabezado, Esqueleto } from 'ui-comun';
import { RutasFachada } from '../rutas.fachada';

/** Ficha de una ruta (G4) con lo que trae el esquema. */
@Component({
  selector: 'app-ruta',
  providers: [RutasFachada],
  imports: [Esqueleto, Encabezado, DecimalPipe, AvisoServicios],
  template: `
    @let titulo = ruta()?.nombre ?? 'Ruta';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Rutas', ruta: '/rutas' }, { texto: titulo }]" />
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!ruta()" />
    @if (ruta(); as r) {
      <dl class="datos">
        <div>
          <dt>Origen</dt>
          <dd>{{ r.origen }}</dd>
        </div>
        <div>
          <dt>Destino</dt>
          <dd>{{ r.destino }}</dd>
        </div>
        <div>
          <dt>Distancia</dt>
          <dd>{{ r.distanciaKm | number: '1.0-1' }} km</dd>
        </div>
      </dl>
    } @else if (cargado()) {
      <p class="secundario">No se encontró esa ruta. Vuelve a la lista de rutas.</p>
    }
  `,
})
export class RutaPagina {
  private readonly fachada = inject(RutasFachada);
  readonly id = input.required<string>();
  readonly ruta = computed(() => this.fachada.ruta(this.id()));
  readonly cargado = this.fachada.cargado;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { rutas: 'Viajes' };
}
