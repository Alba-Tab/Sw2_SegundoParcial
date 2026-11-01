import { afterNextRender, Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { RouterLink } from '@angular/router';
import { Encabezado, AvisoServicios, CONFIG_CENTRO, Estado, NumeroPipe, pct } from 'ui-comun';
import { mapaSinPosiciones, type ViajeMapa } from '../domain/viaje';
import { MapaFachada } from '../viajes.fachada';
import { Vistas, VISTAS } from '../../vistas';

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
    // Sin predicción, o sin permiso para verla (comercial), la línea no se muestra: nada de «Riesgo Sin dato» (V3-5).
    ...(v.riesgo ? [`Riesgo de retraso ${pct(v.riesgo.probabilidad)}`, salto()] : []),
    enlace,
  );
  return caja;
}

/** Mapa en vivo (spec 005): la última posición de cada viaje en ruta, cada 15 s; en ámbar (aviso, como su chip) los que tienen riesgo. */
@Component({
  selector: 'app-mapa',
  providers: [MapaFachada],
  imports: [Vistas, Encabezado, AvisoServicios, Estado, NumeroPipe, RouterLink],
  template: `<cc-encabezado titulo="Mapa en vivo" />
    <app-vistas [vistas]="vistas" nombre="Vistas de viajes" />
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!viajes().length" />
    <!-- La región vive siempre en el DOM para que el lector anuncie el texto cuando aparece (V3-6). -->
    <p class="secundario" role="status">
      @if (sinPosicion()) {
        Ese viaje aún no reporta posición.
      } @else if (vacio()) {
        Ningún viaje en ruta reporta posición ahora.
      }
    </p>
    <div
      #mapa
      class="mapa"
      role="application"
      aria-label="Mapa de viajes en ruta"
      [attr.aria-describedby]="viajes().length ? 'viajes-mapa' : null"
    ></div>
    <!-- Lo mismo que el mapa, en texto: para el teclado y el lector de pantalla (CA-6). -->
    @if (viajes().length) {
      <h2 id="viajes-mapa">Viajes en ruta ({{ viajes().length }})</h2>
      <ul class="viajes">
        @for (v of viajes(); track v.viajeId) {
          <li>
            <a [routerLink]="['/viajes', v.viajeId]">{{ v.placa ?? 'Sin unidad' }}</a>
            <span>{{ v.cliente.razonSocial }} · {{ v.ruta.nombre }}</span>
            @if (v.ultimaPosicion; as p) {
              <span class="secundario">Posición {{ p.lat | numero: 4 }}; {{ p.lng | numero: 4 }}</span>
            } @else {
              <span class="secundario">Aún no reporta posición</span>
            }
            @if (v.riesgo; as r) {
              @if (r.enRiesgo) {
                <span><cc-estado grupo="Riesgo" valor="EN_RIESGO" /> {{ pct(r.probabilidad) }}</span>
              }
            }
          </li>
        }
      </ul>
    }`,
  styles: `
    p:empty {
      margin: 0;
    }
    .mapa {
      height: calc(100vh - 280px);
      min-height: 420px;
      border-radius: 12px;
    }
    .viajes {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .viajes li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 16px;
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
  `,
})
export class MapaPagina implements OnDestroy {
  readonly vistas = VISTAS.viajes;
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private readonly config = inject(CONFIG_CENTRO);
  private readonly fachada = inject(MapaFachada);
  readonly viajes = this.fachada.viajes;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly campos = { viajesEnCurso: 'Viajes', riesgo: 'Analítica' };
  /** `?viaje=<id>` (desde "Ver en el mapa" del detalle): se centra y abre ese marcador una vez (C-15). */
  readonly viaje = input<string>();
  /** Señal: si los datos llegan antes que el mapa (caché al volver), el centrado espera a que exista (V1-9). */
  private readonly mapa = signal<L.Map | undefined>(undefined);
  readonly sinPosicion = signal(false);
  readonly pct = pct;
  readonly vacio = computed(() => mapaSinPosiciones(this.viajes(), this.fachada.cargando(), this.fachada.error()));
  private capa = L.layerGroup();
  private centrado = false;
  /** Cambia con el tema del sistema: los marcadores se repintan con los colores nuevos (A-11). */
  private readonly oscuro = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  private readonly alCambiarTema = (e: MediaQueryListEvent) => this.oscuro.set(e.matches);

  constructor() {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.alCambiarTema);
    afterNextRender(() => {
      const mapa = L.map(this.contenedor().nativeElement).setView([-17.78, -63.18], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(mapa);
      this.capa.addTo(mapa);
      this.mapa.set(mapa);
    });
    effect(() => {
      const viajes = this.viajes();
      const mapa = this.mapa();
      this.oscuro();
      // Leaflet pinta en SVG con colores en JS: se leen de los tokens para seguir el tema (claro u oscuro).
      const tokens = getComputedStyle(document.documentElement);
      const conRiesgo = tokens.getPropertyValue('--mat-sys-advertencia').trim();
      const normal = tokens.getPropertyValue('--mat-sys-primary').trim();
      this.capa.clearLayers();
      for (const v of viajes) {
        const lat = v.ultimaPosicion?.lat;
        const lng = v.ultimaPosicion?.lng;
        if (lat === undefined || lng === undefined) continue;
        const riesgo = v.riesgo?.enRiesgo;
        const marcador = L.circleMarker([lat, lng], { radius: 9, color: riesgo ? conRiesgo : normal, fillOpacity: 0.8 })
          .bindPopup(popupViaje(v, `${this.config.urls['cc-operaciones']}/viajes/${encodeURIComponent(v.viajeId)}`))
          .addTo(this.capa);
        if (!this.centrado && mapa && v.viajeId === this.viaje()) {
          this.centrado = true;
          mapa.setView([lat, lng], 11);
          marcador.openPopup();
        }
      }
      // Si Viajes no respondió no se sabe nada del viaje: el aviso de servicios lo dice, no «aún no reporta» (V3-6).
      const viajesCaido = !!this.fachada.error() && !viajes.length;
      this.sinPosicion.set(!!mapa && !!this.viaje() && !this.centrado && !this.fachada.cargando() && !viajesCaido);
    });
  }

  ngOnDestroy(): void {
    matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this.alCambiarTema);
    this.mapa()?.remove();
  }
}
