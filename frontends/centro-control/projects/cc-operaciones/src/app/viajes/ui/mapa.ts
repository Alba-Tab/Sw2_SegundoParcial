import { afterNextRender, Component, effect, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { AvisoServicios, CONFIG_CENTRO, pct } from 'ui-comun';
import type { ViajeMapa } from '../domain/viaje';
import { MapaFachada } from '../viajes.fachada';

/**
 * Contenido del popup armado con nodos y `textContent`: la razón social la escribe el cliente al registrarse, así que
 * nunca se interpreta como HTML (Leaflet usa innerHTML si recibe un texto).
 */
export function popupViaje(v: ViajeMapa, urlViaje: string): HTMLElement {
  const caja = document.createElement('div');
  const placa = document.createElement('b');
  placa.textContent = v.placa ?? '';
  const enlace = document.createElement('a');
  enlace.href = urlViaje;
  enlace.textContent = 'Ver viaje';
  const salto = () => document.createElement('br');
  caja.append(
    placa,
    ` · ${v.cliente?.razonSocial ?? ''}`,
    salto(),
    v.ruta?.nombre ?? '',
    salto(),
    `Riesgo ${pct(v.riesgo?.probabilidad)}`,
    salto(),
    enlace,
  );
  return caja;
}

/** Mapa en vivo (spec 005): la última posición de cada viaje en ruta, cada 15 s; en rojo los que tienen riesgo. */
@Component({
  selector: 'app-mapa',
  providers: [MapaFachada],
  imports: [AvisoServicios],
  template: `<h1>Mapa en vivo</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!viajes().length" />
    <div #mapa class="mapa" role="application" aria-label="Mapa de viajes en ruta"></div>`,
  styles: `
    .mapa {
      height: calc(100vh - 220px);
      min-height: 420px;
      border-radius: 12px;
    }
  `,
})
export class MapaPagina implements OnDestroy {
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private readonly config = inject(CONFIG_CENTRO);
  private readonly fachada = inject(MapaFachada);
  readonly viajes = this.fachada.viajes;
  readonly error = this.fachada.error;
  readonly campos = { viajesEnCurso: 'Viajes', riesgo: 'Analítica' };
  private mapa?: L.Map;
  private capa = L.layerGroup();

  constructor() {
    afterNextRender(() => {
      this.mapa = L.map(this.contenedor().nativeElement).setView([-17.78, -63.18], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(this.mapa);
      this.capa.addTo(this.mapa);
    });
    effect(() => {
      const viajes = this.viajes();
      this.capa.clearLayers();
      for (const v of viajes) {
        const lat = v.ultimaPosicion?.lat;
        const lng = v.ultimaPosicion?.lng;
        if (lat === undefined || lng === undefined) continue;
        const riesgo = v.riesgo?.enRiesgo;
        L.circleMarker([lat, lng], { radius: 9, color: riesgo ? '#ba1a1a' : '#3c6090', fillOpacity: 0.8 })
          .bindPopup(popupViaje(v, `${this.config.urls['cc-operaciones']}/viajes/${encodeURIComponent(v.viajeId)}`))
          .addTo(this.capa);
      }
    });
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }
}
