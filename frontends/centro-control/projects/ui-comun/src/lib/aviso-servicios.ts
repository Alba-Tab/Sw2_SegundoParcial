import { afterNextRender, Component, computed, inject, Injector, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Apollo } from 'apollo-angular';
import { erroresGraphql, mensajeDe, servicioCaido } from './errores';
import { enfocarTitulo } from './formulario';
import { FechaPipe } from './formato';

/** Qué servicio está detrás de cada campo de la consulta de una página, para decir cuál no está disponible ('' si lo dice la página). */
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
    // Un campo con nombre vacío lo explica su propia sección: sin banner repetido (V1-10).
    if (campo && !campos[campo]) continue;
    caidos.add(campo ? `${campos[campo]} no disponible` : 'Un servicio no está disponible');
  }
  if (caidos.size) return [...caidos];
  return sinDatos ? [mensajeDe(error)] : [];
}

/**
 * Banner de la respuesta parcial; cada página dice qué servicio responde cada campo de su consulta. Siempre con salida:
 * "Reintentar" (y en un detalle, el "volver" del encabezado).
 */
@Component({
  selector: 'cc-aviso-servicios',
  imports: [MatButtonModule, MatIconModule, FechaPipe],
  template: `
    @if (noEncontrado()) {
      <!-- No encontrado no es un servicio caído: otro ícono y sin «Reintentar»; la salida es el «volver» del encabezado (FB-2). -->
      <p class="aviso-servicio no-encontrado" role="alert">
        <mat-icon>search_off</mat-icon> No encontramos {{ buscado() }}. Puede que el enlace esté mal o que ya no exista.
      </p>
    }
    @for (a of avisos(); track a) {
      <p class="aviso-servicio" role="alert"><mat-icon>cloud_off</mat-icon> {{ a }}</p>
    }
    @if (avisos().length && datosAl(); as d) {
      <!-- FB-1: lo que ya estaba en pantalla se conserva y se dice de cuándo es. -->
      <p class="datos-al">Se muestran los datos al {{ d | fecha: true }}.</p>
    }
    @if (avisos().length) {
      <!-- disabledInteractive: con el foco encima, deshabilitarlo de verdad lo mandaría a <body> (V4, foco). -->
      <button mat-stroked-button class="reintentar" (click)="reintentarAhora()" [disabled]="reintentando()" disabledInteractive>
        <mat-icon>replay</mat-icon>Reintentar
      </button>
    }
    <!-- Siempre presente para que el lector de pantalla anuncie el cambio (V2-9, V2-10, V4-4). -->
    <p class="cdk-visually-hidden" aria-live="polite">{{ anuncio() }}</p>
  `,
  styles: `
    .reintentar {
      margin: 0 0 16px;
    }
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
    .datos-al {
      margin: -4px 0 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .no-encontrado {
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class AvisoServicios {
  readonly error = input<unknown>();
  readonly campos = input<CamposPorServicio>({});
  /** La página no tiene nada que mostrar: también se avisa un error que no es de un servicio caído. */
  readonly sinDatos = input(false);
  /** Un aviso que la página arma sola (p. ej. «la lista está incompleta») y que también se arregla con «Reintentar» (V3-7). */
  readonly extra = input<string | null>(null);
  /** Hora de los datos que se siguen mostrando tras un sondeo fallido (`conservarUltimoBueno`, FB-1). */
  readonly datosAl = input<string | null | undefined>();
  /** Qué no se encontró, para el aviso de un detalle: «esta unidad», «este viaje». */
  readonly buscado = input('lo que buscas');
  /** Un detalle sin datos porque el servicio respondió NO_ENCONTRADO: se dice eso, no que el servicio falló (FB-2). */
  readonly noEncontrado = computed(
    () => this.sinDatos() && erroresGraphql(this.error()).some((e) => e.extensions?.['codigo'] === 'NO_ENCONTRADO'),
  );
  readonly avisos = computed(() => {
    if (this.noEncontrado()) return [];
    const extra = this.extra();
    // Con datos conservados la página no está vacía, pero el error se dice igual: lo que se ve puede estar viejo.
    const sinDatos = this.sinDatos() || !!this.datosAl();
    return [...avisosServicio(this.error(), this.campos(), sinDatos), ...(extra ? [extra] : [])];
  });
  /**
   * Qué hacer al reintentar (el `recargar` de la fachada). Sin él, se vuelven a pedir las consultas activas de la
   * página. Nunca se recarga la página: se perdería lo escrito en un formulario y su clave de idempotencia (E-2).
   */
  readonly reintentar = input<() => unknown>();
  private readonly apollo = inject(Apollo, { optional: true });
  private readonly injector = inject(Injector);

  /** Mientras dura el reintento, el botón se deshabilita y se anuncia "Reintentando…" (V2-9). */
  readonly reintentando = signal(false);
  /** Lo que dice la región viva: "Reintentando…" y, si vuelve a fallar, que sigue sin responder (V4-4). */
  readonly anuncio = signal('');

  async reintentarAhora(): Promise<void> {
    // El botón sigue enfocable mientras reintenta (aria-disabled): un segundo clic no hace nada.
    if (this.reintentando()) return;
    const reintentar = this.reintentar() ?? (() => this.apollo?.client.refetchObservableQueries());
    const foco = document.activeElement;
    this.reintentando.set(true);
    this.anuncio.set('Reintentando…');
    try {
      await reintentar();
    } catch {
      // El error de un reintento lo vuelve a mostrar el mismo aviso.
    } finally {
      this.reintentando.set(false);
    }
    // Las entradas `error` y `extra` las cambia el padre en su próxima detección de cambios, no al resolver: se leen
    // después de ese render (V6-1). Leerlas aquí mismo daba el resultado del intento anterior.
    await new Promise<void>((listo) => afterNextRender(() => listo(), { injector: this.injector }));
    const sigue = this.avisos()[0];
    this.anuncio.set(sigue ? `Sigue sin responder: ${sigue}` : '');
    // Funcionó: el aviso y su botón se van; el foco no se queda en <body>, va al título de la página (V4-3).
    if (!sigue && (document.activeElement === foco || document.activeElement === document.body)) enfocarTitulo();
  }
}
