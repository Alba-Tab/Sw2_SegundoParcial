import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterOutlet } from '@angular/router';
import { Alertas } from './alertas';
import { APPS_POR_ROL, CONFIG_CENTRO, NOMBRES_APPS, type App } from './configuracion';
import { FechaPipe } from './formato';
import { Sesion } from './sesion';

/** D100: cada 60 s se pide /salud.json de cada app enlazada; si falla, el enlace queda deshabilitado (FR3). */
export const INTERVALO_SALUD_MS = 60_000;

/**
 * Marco común de las 4 apps (propuesta 6.1): barra con los enlaces que el rol permite y su disponibilidad, campana de
 * alertas y cierre de sesión. Las apps no se importan entre sí: los enlaces son URL.
 */
@Component({
  selector: 'cc-marco',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
    MatDividerModule,
    FechaPipe,
  ],
  template: `
    <mat-toolbar class="barra">
      <span class="marca">Transporte · {{ nombres[config.app] }}</span>
      <nav class="enlaces" aria-label="Apps del Centro de Control">
        @for (app of apps(); track app) {
          @if (app === config.app) {
            <a mat-button class="actual" aria-current="page">{{ nombres[app] }}</a>
          } @else if (caidas().has(app)) {
            <span class="no-disponible" matTooltip="No disponible">{{ nombres[app] }}</span>
          } @else {
            <a mat-button [href]="config.urls[app]">{{ nombres[app] }}</a>
          }
        }
      </nav>
      <span class="espacio"></span>
      @if (recibeAlertas()) {
        <button
          mat-icon-button
          [matMenuTriggerFor]="menuAlertas"
          aria-label="Alertas"
          [matBadge]="alertas.abiertas() || null"
          [matBadgeDescription]="descripcionAlertas()"
          matBadgeColor="warn"
        >
          <mat-icon>{{ alertas.disponible() ? 'notifications' : 'notifications_off' }}</mat-icon>
        </button>
        <mat-menu #menuAlertas="matMenu" class="menu-alertas">
          @if (!alertas.disponible()) {
            <p class="aviso">Alertas no disponibles</p>
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
              [attr.data-severidad]="a.severidad"
            >
              <span class="titulo">{{ a.titulo }}</span>
              <span class="detalle">{{ a.detalle }}</span>
              <span class="pie">{{ a.creadaEn | fecha: true }} · {{ a.estado }}</span>
            </a>
            @if (a.estado === 'ABIERTA' && puedeAtender()) {
              <button mat-menu-item class="atender" (click)="$event.stopPropagation(); alertas.atender(a)">
                <mat-icon>done</mat-icon> Marcar atendida: {{ a.titulo }}
              </button>
            }
          } @empty {
            <p class="aviso">Sin alertas</p>
          }
        </mat-menu>
      }
      <button mat-button [matMenuTriggerFor]="menuUsuario"><mat-icon>account_circle</mat-icon> {{ sesion.nombre() }}</button>
      <mat-menu #menuUsuario="matMenu">
        <span class="aviso">{{ sesion.rolesInternos().join(', ') }}</span>
        <mat-divider />
        <button mat-menu-item (click)="sesion.cerrar()"><mat-icon>logout</mat-icon> Cerrar sesión</button>
      </mat-menu>
    </mat-toolbar>
    <main class="contenido"><router-outlet /></main>
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
    }
    .enlaces {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .actual {
      background: var(--mat-sys-secondary-container);
    }
    .no-disponible {
      opacity: 0.45;
      padding: 0 12px;
      font-size: 14px;
    }
    .espacio {
      flex: 1;
    }
    .contenido {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .aviso {
      padding: 8px 16px;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }
    .no-atendida {
      color: var(--mat-sys-error);
    }
    .alerta {
      height: auto;
      min-height: 56px;
      padding-block: 8px;
      max-width: 420px;
      border-left: 4px solid var(--mat-sys-primary);
    }
    .alerta span {
      display: block;
      white-space: normal;
    }
    .atender {
      font-size: 13px;
      min-height: 36px;
    }
    .alerta[data-severidad='ALTA'] {
      border-color: var(--mat-sys-tertiary);
    }
    .alerta[data-severidad='CRITICA'] {
      border-color: var(--mat-sys-error);
    }
    .alerta.cerrada {
      opacity: 0.6;
    }
    .titulo {
      font-weight: 600;
      color: inherit;
    }
    .detalle,
    .pie {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class Marco implements OnInit {
  readonly config = inject(CONFIG_CENTRO);
  readonly sesion = inject(Sesion);
  readonly alertas = inject(Alertas);
  readonly nombres = NOMBRES_APPS;
  readonly caidas = signal(new Set<App>());
  readonly apps = computed(() => {
    const permitidas = new Set(this.sesion.roles().flatMap((r) => APPS_POR_ROL[r] ?? []));
    return (Object.keys(NOMBRES_APPS) as App[]).filter((a) => permitidas.has(a));
  });
  /** comercial no recibe alertas (la suscripción cerraría con 4403). */
  readonly recibeAlertas = computed(() => this.sesion.tiene('gerente', 'despachador', 'jefe_flota', 'administracion'));
  readonly puedeAtender = computed(() => this.sesion.tiene('despachador', 'jefe_flota', 'administracion'));
  /** El número del badge no se lee solo: los lectores de pantalla anuncian esta descripción con el botón. */
  readonly descripcionAlertas = computed(() => {
    const n = this.alertas.abiertas();
    return n === 1 ? '1 alerta abierta' : `${n} alertas abiertas`;
  });

  ngOnInit(): void {
    if (this.recibeAlertas()) void this.alertas.iniciar();
    void this.revisarSalud();
    setInterval(() => void this.revisarSalud(), INTERVALO_SALUD_MS);
  }

  private async revisarSalud(): Promise<void> {
    const caidas = new Set<App>();
    await Promise.all(
      this.apps()
        .filter((a) => a !== this.config.app)
        .map(async (a) => {
          // Otro origen sin CORS: con no-cors la respuesta es opaca y no se puede leer `ok`; que resuelva basta para saber que
          // el hosting responde. Solo un fallo de red o el tiempo de espera marcan la app "no disponible" (FR3).
          const ok = await fetch(`${this.config.urls[a]}/salud.json`, {
            mode: 'no-cors',
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
          }).then(
            () => true,
            () => false,
          );
          if (!ok) caidas.add(a);
        }),
    );
    this.caidas.set(caidas);
  }
}
