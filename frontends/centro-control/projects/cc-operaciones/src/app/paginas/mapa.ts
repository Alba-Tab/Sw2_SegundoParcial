import { afterNextRender, Component, effect, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import { CONFIG_CENTRO, pct } from 'ui-comun';
import { MapaGQL } from '../graphql/generado';

/** Mapa en vivo (spec 005): la última posición de cada viaje en ruta, cada 15 s; en rojo los que tienen riesgo. */
@Component({
  selector: 'app-mapa',
  template: `<h1>Mapa en vivo</h1>
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
  private readonly datos = toSignal(inject(MapaGQL).watch({ pollInterval: 15_000 }).valueChanges);
  private mapa?: L.Map;
  private capa = L.layerGroup();

  constructor() {
    afterNextRender(() => {
      this.mapa = L.map(this.contenedor().nativeElement).setView([-17.78, -63.18], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(this.mapa);
      this.capa.addTo(this.mapa);
    });
    effect(() => {
      const viajes = this.datos()?.data?.viajesEnCurso ?? [];
      this.capa.clearLayers();
      for (const v of viajes) {
        const lat = v?.ultimaPosicion?.lat;
        const lng = v?.ultimaPosicion?.lng;
        if (lat === undefined || lng === undefined) continue;
        const riesgo = v.riesgo?.enRiesgo;
        L.circleMarker([lat, lng], { radius: 9, color: riesgo ? '#ba1a1a' : '#3c6090', fillOpacity: 0.8 })
          .bindPopup(
            `<b>${v.placa}</b> · ${v.cliente?.razonSocial ?? ''}<br>${v.ruta?.nombre ?? ''}<br>Riesgo ${pct(v.riesgo?.probabilidad)}<br>` +
              `<a href="${this.config.urls['cc-operaciones']}/viajes/${v.viajeId}">Ver viaje</a>`,
          )
          .addTo(this.capa);
      }
    });
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }
}
