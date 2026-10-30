import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, type Subscription } from 'rxjs';
import { nuevaClave } from './clave';
import { CONFIG_CENTRO, type App } from './configuracion';
import { EstadoConexion } from './conexion';
import { AlertasNuevasGQL, AlertasPendientesGQL, AtenderAlertaGQL, type AlertaCamposFragment } from './graphql/generado';

/**
 * Campana (spec 013, E): pide primero las pendientes y después escucha la suscripción. Al reconectar (token vencido,
 * los 3.600 s de Cloud Run o una caída) vuelve a pedir `alertasPendientes(desde: último cursor)`: no se pierde
 * ninguna. Las repetidas se descartan por `alertaId`.
 */
@Injectable({ providedIn: 'root' })
export class Alertas {
  private readonly pendientes = inject(AlertasPendientesGQL);
  private readonly nuevas = inject(AlertasNuevasGQL);
  private readonly atenderGql = inject(AtenderAlertaGQL);
  private readonly config = inject(CONFIG_CENTRO);
  private readonly conexion = inject(EstadoConexion);
  private cursor: string | null = null;
  private suscripcion?: Subscription;

  readonly lista = signal<AlertaCamposFragment[]>([]);
  readonly abiertas = signal(0);
  readonly disponible = signal(true);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.suscripcion?.unsubscribe());
    effect(() => {
      if (this.conexion.reconexiones() > 0) void this.ponerseAlDia();
    });
  }

  async iniciar(): Promise<void> {
    await this.ponerseAlDia();
    this.suscripcion ??= this.nuevas.subscribe().subscribe({
      next: ({ data }) => data?.alertas && this.agregar([data.alertas], 1),
      error: () => this.disponible.set(false),
    });
  }

  private async ponerseAlDia(): Promise<void> {
    try {
      const { data } = await firstValueFrom(this.pendientes.fetch({ variables: { desde: this.cursor } }));
      const pagina = data?.alertasPendientes;
      if (!pagina) return this.disponible.set(false);
      this.disponible.set(true);
      this.cursor = pagina.siguienteCursor ?? this.cursor;
      this.abiertas.set(pagina.abiertas);
      this.agregar(pagina.alertas, 0);
    } catch {
      this.disponible.set(false);
    }
  }

  private agregar(nuevas: AlertaCamposFragment[], sumar: number): void {
    const vistas = new Set(this.lista().map((a) => a.alertaId));
    const frescas = nuevas.filter((a) => !vistas.has(a.alertaId));
    if (!frescas.length) return;
    this.lista.set([...frescas.reverse(), ...this.lista()].slice(0, 50));
    this.abiertas.update((n) => n + sumar * frescas.filter((a) => a.estado === 'ABIERTA').length);
  }

  /** El enlace de Analítica es "/<app>/<ruta>": se abre en la app que corresponde, solo por URL (propuesta 6.1). */
  url(alerta: AlertaCamposFragment): string {
    const [, app, ...resto] = alerta.enlace.split('/');
    const base = this.config.urls[app as App] ?? '';
    return `${base}/${resto.join('/')}`;
  }

  atender(alerta: AlertaCamposFragment, nota?: string) {
    return this.atenderGql.mutate({ variables: { alertaId: alerta.alertaId, nota, clave: nuevaClave() } }).subscribe(({ data }) => {
      if (data?.atenderAlerta.estado !== 'ATENDIDA') return;
      this.lista.update((l) => l.map((a) => (a.alertaId === alerta.alertaId ? { ...a, estado: 'ATENDIDA' } : a)));
      this.abiertas.update((n) => Math.max(0, n - 1));
    });
  }
}
