import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { erroresGraphql, mensajeDe, servicioCaido } from './errores';

/** Qué servicio está detrás de cada campo de la consulta de una página, para decir cuál no está disponible. */
export type CamposPorServicio = Record<string, string>;

/**
 * Respuesta parcial (FR1, FR2): un aviso "<Servicio> no disponible" por cada campo que el Gateway dejó en null con
 * `DEPENDENCIA_NO_DISPONIBLE`. Si no hay campos caídos pero la página se quedó sin datos (red, Gateway caído, permiso),
 * el mensaje del error.
 */
export function avisosServicio(error: unknown, campos: CamposPorServicio, sinDatos = false): string[] {
  if (!error) return [];
  const caidos = new Set<string>();
  for (const e of erroresGraphql(error)) {
    if (e.extensions?.['codigo'] !== 'DEPENDENCIA_NO_DISPONIBLE') continue;
    // El campo más profundo del path manda: en ['viaje', 'unidad'] la que cayó es Flota, no Viajes.
    const campo = [...(e.path ?? [])].reverse().find((p): p is string => typeof p === 'string' && servicioCaido(error, p) && p in campos);
    caidos.add(campo ? `${campos[campo]} no disponible` : e.message || 'Un servicio no está disponible');
  }
  if (caidos.size) return [...caidos];
  return sinDatos ? [mensajeDe(error)] : [];
}

/** Banner de la respuesta parcial; cada página dice qué servicio responde cada campo de su consulta. */
@Component({
  selector: 'cc-aviso-servicios',
  imports: [MatIconModule],
  template: `
    @for (a of avisos(); track a) {
      <p class="aviso-servicio" role="alert"><mat-icon aria-hidden="true">cloud_off</mat-icon> {{ a }}</p>
    }
  `,
  styles: `
    .aviso-servicio {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class AvisoServicios {
  readonly error = input<unknown>();
  readonly campos = input<CamposPorServicio>({});
  /** La página no tiene nada que mostrar: también se avisa un error que no es de un servicio caído. */
  readonly sinDatos = input(false);
  readonly avisos = computed(() => avisosServicio(this.error(), this.campos(), this.sinDatos()));
}
