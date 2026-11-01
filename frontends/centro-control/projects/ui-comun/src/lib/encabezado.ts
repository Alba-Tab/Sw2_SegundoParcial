import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { migaPadre, type Miga } from 'ui-comun/dominio';
import { appOrigen, CONFIG_CENTRO, NOMBRES_APPS } from './configuracion';
import { MemoriaListas } from './lista';

/**
 * Encabezado común de página (DESIGN.md, "Encabezado"): migas, "volver" a la lista padre, `h1` con su estado
 * (`<cc-estado>` proyectado), subtítulo y acciones (el resto del contenido proyectado). Si se llegó desde otra app con
 * `?desde=<app>` (una alerta), ofrece volver a ella. Las apps solo se enlazan por URL.
 */
@Component({
  selector: 'cc-encabezado',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (origen(); as o) {
      <a mat-button class="origen" [href]="config.urls[o]"><mat-icon>arrow_back</mat-icon>Volver a {{ nombres[o] }}</a>
    }
    @if (migas().length > 1) {
      <nav class="migas" aria-label="Migas de pan">
        <ol>
          @for (m of migas(); track $index) {
            <li>
              @if (m.ruta && !$last) {
                <a [routerLink]="m.ruta" [queryParams]="memoria.de(m.ruta)">{{ m.texto }}</a>
              } @else {
                <span [attr.aria-current]="$last ? 'page' : null">{{ m.texto }}</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
    <div class="fila">
      @if (padre(); as p) {
        <a mat-icon-button class="volver" [routerLink]="p.ruta" [queryParams]="memoria.de(p.ruta)" [attr.aria-label]="'Volver a ' + p.texto"
          ><mat-icon>arrow_back</mat-icon></a
        >
      }
      <h1 tabindex="-1">{{ titulo() }} <ng-content select="cc-estado" /></h1>
      <div class="acciones"><ng-content /></div>
    </div>
    @if (subtitulo()) {
      <p class="secundario subtitulo">{{ subtitulo() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 16px;
    }
    .origen {
      margin-bottom: 4px;
    }
    .migas ol {
      display: flex;
      flex-wrap: wrap;
      list-style: none;
      margin: 0 0 4px;
      padding: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .migas li + li::before {
      content: '›' / '';
      padding: 0 8px;
    }
    .migas a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: var(--mat-sys-primary);
    }
    .migas span {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
    .fila {
      display: flex;
      align-items: center;
      gap: 8px 16px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .acciones {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-left: auto;
    }
    .acciones:empty {
      display: none;
    }
    .subtitulo {
      margin: 4px 0 0;
    }
  `,
})
export class Encabezado {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>();
  /** De la raíz a la página actual; la última no lleva ruta. En una lista basta el título. */
  readonly migas = input<Miga[]>([]);
  readonly config = inject(CONFIG_CENTRO);
  readonly nombres = NOMBRES_APPS;
  /** Volver a la lista con su búsqueda, filtro, orden y página (C-3). */
  readonly memoria = inject(MemoriaListas);
  readonly padre = computed(() => migaPadre(this.migas()));
  private readonly consulta = toSignal(inject(ActivatedRoute).queryParamMap);
  readonly origen = computed(() => appOrigen(this.consulta()?.get('desde'), this.config.app));
}
