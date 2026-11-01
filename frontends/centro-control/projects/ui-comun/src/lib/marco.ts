import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Alertas } from './alertas';
import { appsDeRoles, CONFIG_CENTRO, NOMBRES_APPS, type App } from './configuracion';
import { etiqueta, urlAdminKeycloak } from 'ui-comun/dominio';
import { EtiquetaPipe } from './estado';
import { FechaPipe } from './formato';
import { Sesion } from './sesion';

/** D100: cada 60 s se pide /salud.json de cada app enlazada; si falla, el enlace queda deshabilitado (FR3). */
export const INTERVALO_SALUD_MS = 60_000;

/**
 * ¿El hosting de la app responde `/salud.json` con `{"estado":"UP"}`? (FR3, spec 016 paso 16). Se pide con `cors` para
 * poder leer el status y el cuerpo: con `no-cors` la respuesta es opaca y un hosting deshabilitado ("Site Not Found", 404)
 * pasaría por disponible. Por eso el hosting de cada app en la nube tiene que servir `/salud.json` con
 * `Access-Control-Allow-Origin` para los orígenes de las otras apps (lo configura el despliegue); en local, el dev server
 * de Angular ya lo manda. Un fallo de red, el CORS, un status que no es 2xx, otro cuerpo o 5 s sin respuesta: no disponible.
 */
export async function appDisponible(urlApp: string, pedir: typeof fetch = (url, init) => fetch(url, init)): Promise<boolean> {
  try {
    const r = await pedir(`${urlApp}/salud.json`, { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!r.ok) return false;
    const cuerpo = (await r.json()) as { estado?: unknown } | null;
    return cuerpo?.estado === 'UP';
  } catch {
    return false;
  }
}

/**
 * Marco común de las 4 apps (propuesta 6.1): barra con los enlaces que el rol permite y su disponibilidad, campana de
 * alertas y cierre de sesión. Las apps no se importan entre sí: los enlaces son URL.
 */
@Component({
  selector: 'cc-marco',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
    MatDividerModule,
    FechaPipe,
    EtiquetaPipe,
  ],
  template: `
    <a class="saltar" href="#contenido" (click)="saltar($event)">Saltar al contenido</a>
    <mat-toolbar class="barra">
      <a class="marca" routerLink="/">Transporte · {{ nombres[config.app] }}</a>
      <nav class="enlaces" aria-label="Apps del Centro de Control">
        @for (app of apps(); track app) {
          @if (app === config.app) {
            <!-- La marca ya enlaza a "/": la app actual no repite el enlace (B-10). -->
            <span class="actual" aria-current="page">{{ nombres[app] }}</span>
          } @else if (caidas().has(app)) {
            <span class="no-disponible" matTooltip="No disponible"
              >{{ nombres[app] }}<span class="cdk-visually-hidden"> (no disponible)</span></span
            >
          } @else {
            <a mat-button [href]="config.urls[app]">{{ nombres[app] }}</a>
          }
        }
      </nav>
      <!-- Bajo 900 px las apps van en este menú: la barra no desborda a 375 px (RS-1). -->
      <button mat-icon-button class="boton-apps" [matMenuTriggerFor]="menuApps" aria-label="Apps del Centro de Control">
        <mat-icon>apps</mat-icon>
      </button>
      <mat-menu #menuApps="matMenu">
        @for (app of apps(); track app) {
          @if (app === config.app) {
            <a mat-menu-item class="app-actual" routerLink="/" aria-current="page">{{ nombres[app] }}</a>
          } @else if (caidas().has(app)) {
            <button mat-menu-item disabled disabledInteractive><mat-icon>cloud_off</mat-icon>{{ nombres[app] }} (no disponible)</button>
          } @else {
            <a mat-menu-item [href]="config.urls[app]">{{ nombres[app] }}</a>
          }
        }
      </mat-menu>
      <span class="espacio"></span>
      @if (recibeAlertas()) {
        <button
          mat-icon-button
          [matMenuTriggerFor]="menuAlertas"
          [attr.aria-label]="alertas.disponible() ? 'Alertas' : 'Alertas no disponibles: el servicio de alertas no responde'"
          [matTooltip]="alertas.disponible() ? '' : 'Alertas no disponibles: el servicio de alertas no responde'"
          [matBadge]="alertas.abiertas() || null"
          [matBadgeDescription]="descripcionAlertas()"
          matBadgeColor="warn"
        >
          <mat-icon>{{ alertas.disponible() ? 'notifications' : 'cloud_off' }}</mat-icon>
        </button>
        <mat-menu #menuAlertas="matMenu" class="menu-alertas">
          @if (!alertas.disponible()) {
            <p class="aviso">Alertas no disponibles: el servicio de alertas no responde. Se reintenta solo.</p>
          }
          @if (alertas.errorAtencion(); as e) {
            <p class="aviso no-atendida" role="alert">{{ e }}</p>
          }
          <!-- Cada alerta y su "Marcar atendida" son mat-menu-item: se recorren con las flechas y se abren con Enter. -->
          @for (a of alertas.lista(); track a.alertaId) {
            <a
              mat-menu-item
              class="alerta"
              [href]="alertas.url(a)"
              [class.cerrada]="a.estado !== 'ABIERTA'"
              [attr.data-tono]="severidad(a.severidad).tono"
            >
              <span class="titulo"
                ><mat-icon>{{ severidad(a.severidad).icono }}</mat-icon
                >{{ a.titulo }}</span
              >
              <span class="severidad">{{ severidad(a.severidad).texto }}</span>
              <span class="detalle">{{ a.detalle }}</span>
              <span class="pie">{{ a.creadaEn | fecha: true }} · {{ a.estado | etiqueta: 'EstadoAlerta' }}</span>
            </a>
            @if (a.estado === 'ABIERTA' && puedeAtender()) {
              <button mat-menu-item class="atender" (click)="$event.stopPropagation(); alertas.atender(a)">
                <mat-icon>check</mat-icon> Marcar atendida: {{ a.titulo }}
              </button>
            }
          } @empty {
            <p class="aviso">Sin alertas</p>
          }
        </mat-menu>
      }
      <button mat-button class="usuario" [matMenuTriggerFor]="menuUsuario">
        <mat-icon>account_circle</mat-icon> <span class="nombre-usuario">{{ sesion.nombre() }}</span>
      </button>
      <mat-menu #menuUsuario="matMenu">
        <span class="aviso">{{ roles() }}</span>
        <mat-divider />
        @if (adminUsuarios(); as url) {
          <!-- G8: los usuarios internos y sus roles se administran en la consola de Keycloak; solo el gerente. -->
          <a mat-menu-item [href]="url" target="_blank" rel="noopener noreferrer"
            ><mat-icon>manage_accounts</mat-icon> Administrar usuarios <span class="cdk-visually-hidden">(se abre en otra pestaña)</span></a
          >
        }
        <button mat-menu-item (click)="sesion.cerrar()"><mat-icon>logout</mat-icon> Cerrar sesión</button>
      </mat-menu>
    </mat-toolbar>
    <main id="contenido" class="contenido" tabindex="-1"><router-outlet /></main>
  `,
  styles: `
    .barra {
      gap: 8px;
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--mat-sys-surface-container);
    }
    .marca {
      font-weight: 600;
      margin-right: 16px;
      color: inherit;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
    .marca:hover {
      text-decoration: underline;
    }
    .enlaces {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    /* La app actual: fondo, peso y una barra inferior; no solo un tono. */
    .actual {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      padding: 0 12px;
      border-radius: var(--mat-sys-corner-full, 999px);
      font: var(--mat-sys-label-large);
      background: var(--mat-sys-secondary-container);
      font-weight: 700;
      box-shadow: inset 0 -3px 0 var(--mat-sys-primary);
    }
    /* Sin opacidad: el texto atenuado con opacity baja de AA; se usa el color secundario del tema. */
    .no-disponible {
      color: var(--mat-sys-on-surface-variant);
      padding: 0 12px;
      font: var(--mat-sys-body-medium);
    }
    .espacio {
      flex: 1;
    }
    .boton-apps {
      display: none;
    }
    .app-actual {
      font-weight: 700;
      background: var(--mat-sys-secondary-container);
    }
    /* Bajo 900 px: las apps en el menú «Apps» y el usuario solo con su ícono; el nombre lo sigue leyendo el lector. */
    @media (max-width: 899px) {
      .barra {
        gap: 4px;
        padding-inline: 8px;
      }
      .marca {
        margin-right: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: block;
        line-height: 44px;
      }
      .enlaces {
        display: none;
      }
      .boton-apps {
        display: inline-flex;
        flex: none;
      }
      .usuario {
        min-width: 48px;
        padding-inline: 12px;
        flex: none;
      }
      .usuario mat-icon {
        margin: 0;
      }
      .nombre-usuario {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    }
    .contenido {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }
    @media (max-width: 600px) {
      .contenido {
        padding: 16px;
      }
    }
    .aviso {
      padding: 8px 16px;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    .no-atendida {
      color: var(--mat-sys-error);
    }
    .alerta {
      height: auto;
      min-height: 56px;
      padding-block: 8px;
      max-width: 420px;
    }
    .alerta span {
      display: block;
      white-space: normal;
    }
    .atender {
      font: var(--mat-sys-body-medium);
      min-height: 44px;
    }
    /* La severidad se dice con icono, texto y fondo tintado; nunca solo con color. */
    .alerta[data-tono='aviso'] {
      background: color-mix(in srgb, var(--mat-sys-advertencia-container) 45%, transparent);
    }
    .alerta[data-tono='error'] {
      background: color-mix(in srgb, var(--mat-sys-error-container) 45%, transparent);
    }
    .alerta[data-tono='aviso'] .titulo mat-icon {
      color: var(--mat-sys-advertencia);
    }
    .alerta[data-tono='error'] .titulo mat-icon {
      color: var(--mat-sys-error);
    }
    .alerta.cerrada {
      color: var(--mat-sys-on-surface-variant);
    }
    .titulo {
      font-weight: 600;
      color: inherit;
    }
    .titulo mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      margin-right: 8px;
      vertical-align: text-bottom;
      color: var(--mat-sys-primary);
    }
    /* La severidad decide: se lee al tamaño de una etiqueta, no en el pie de 12 px (A-4). */
    .severidad {
      font: var(--mat-sys-label-large);
    }
    /* El detalle se lee para decidir: 14 px (CA-4); solo el pie (fecha y estado) baja a 12 px. */
    .detalle {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .pie {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class Marco implements OnInit {
  private readonly destruir = inject(DestroyRef);
  readonly config = inject(CONFIG_CENTRO);
  readonly sesion = inject(Sesion);
  readonly alertas = inject(Alertas);
  readonly nombres = NOMBRES_APPS;
  readonly caidas = signal(new Set<App>());
  readonly apps = computed(() => appsDeRoles(this.sesion.roles()));
  /** comercial no recibe alertas (la suscripción cerraría con 4403). */
  readonly recibeAlertas = computed(() => this.sesion.tiene('gerente', 'despachador', 'jefe_flota', 'administracion'));
  readonly adminUsuarios = computed(() => (this.sesion.tiene('gerente') ? urlAdminKeycloak(this.config.oidcIssuer) : undefined));
  readonly puedeAtender = computed(() => this.sesion.tiene('despachador', 'jefe_flota', 'administracion'));
  readonly severidad = (s: string) => etiqueta('SeveridadAlerta', s);
  readonly roles = computed(() =>
    this.sesion
      .rolesInternos()
      .map((r) => etiqueta('Rol', r).texto)
      .join(', '),
  );
  /** El número del badge no se lee solo: los lectores de pantalla anuncian esta descripción con el botón. */
  readonly descripcionAlertas = computed(() => {
    const n = this.alertas.abiertas();
    return n === 1 ? '1 alerta abierta' : `${n} alertas abiertas`;
  });

  /** El ancla iría por el router (base href "/"): se enfoca el contenido sin navegar. */
  saltar(evento: Event): void {
    evento.preventDefault();
    document.getElementById('contenido')?.focus();
  }

  ngOnInit(): void {
    if (this.recibeAlertas()) void this.alertas.iniciar();
    void this.revisarSalud();
    const intervalo = setInterval(() => void this.revisarSalud(), INTERVALO_SALUD_MS);
    this.destruir.onDestroy(() => clearInterval(intervalo));
  }

  private async revisarSalud(): Promise<void> {
    const caidas = new Set<App>();
    await Promise.all(
      this.apps()
        .filter((a) => a !== this.config.app)
        .map(async (a) => {
          if (!(await appDisponible(this.config.urls[a]))) caidas.add(a);
        }),
    );
    this.caidas.set(caidas);
  }
}
