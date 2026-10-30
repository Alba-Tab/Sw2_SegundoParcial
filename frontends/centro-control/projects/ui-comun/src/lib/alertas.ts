import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom, type Subscription } from 'rxjs';
import { nuevaClave } from './clave';
import { CONFIG_CENTRO, type App } from './configuracion';
import { EstadoConexion, esperaReconexion } from './conexion';
import { AlertasNuevasGQL, AlertasPendientesGQL, AtenderAlertaGQL, type AlertaCamposFragment } from './graphql/generado';
import { Sesion } from './sesion';

/** Rol sin alertas (cliente o chofer): el Gateway cierra con 4403 y no tiene sentido reintentar (D77). */
const CIERRE_SIN_PERMISO = 4403;

/** El código de cierre del WebSocket que Apollo deja en el mensaje ("Socket closed with event 4401 …"). */
export function codigoCierre(error: unknown): number | undefined {
  const texto = error instanceof Error ? error.message : '';
  const codigo = /Socket closed with event (\d{4})/.exec(texto)?.[1];
  return codigo ? Number(codigo) : undefined;
}

/**
 * Campana (spec 013, E; spec 016, paso 15): pide primero las pendientes y después escucha la suscripción. El Gateway
 * cierra con 4401 cuando vence el token y a los 3.600 s de Cloud Run, y graphql-ws 6 lo trata como fatal: la
 * suscripción termina con error. Entonces renueva el token, espera 1, 2, 4… s (máximo 30 s, D99), vuelve a pedir
 * `alertasPendientes(desde: último cursor)` y se suscribe de nuevo; al conectar pide otra vez lo pendiente para cubrir el
 * hueco. No se pierde ninguna: las repetidas se descartan por `alertaId`.
 */
@Injectable({ providedIn: 'root' })
export class Alertas {
  private readonly pendientes = inject(AlertasPendientesGQL);
  private readonly nuevas = inject(AlertasNuevasGQL);
  private readonly atenderGql = inject(AtenderAlertaGQL);
  private readonly config = inject(CONFIG_CENTRO);
  private readonly conexion = inject(EstadoConexion);
  private readonly sesion = inject(Sesion);
  private cursor: string | null = null;
  private suscripcion?: Subscription;
  private reintento?: ReturnType<typeof setTimeout>;
  private intento = 0;
  private iniciada = false;
  private terminada = false;

  readonly lista = signal<AlertaCamposFragment[]>([]);
  readonly abiertas = signal(0);
  readonly disponible = signal(true);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.terminada = true;
      clearTimeout(this.reintento);
      this.suscripcion?.unsubscribe();
    });
    // Cada conexión (también la de una suscripción nueva después de un 4401) trae lo que llegó mientras no había socket.
    effect(() => {
      if (this.conexion.conexiones() === 0) return;
      untracked(() => {
        this.intento = 0;
        void this.ponerseAlDia();
      });
    });
  }

  async iniciar(): Promise<void> {
    if (this.iniciada) return;
    this.iniciada = true;
    await this.ponerseAlDia();
    this.suscribir();
  }

  private suscribir(): void {
    if (this.terminada) return;
    this.suscripcion?.unsubscribe();
    // Apollo 4 entrega el error de la suscripción como un resultado con `error` y luego la completa.
    this.suscripcion = this.nuevas.subscribe().subscribe({
      next: ({ data, error }) => {
        if (error) return this.caida(error);
        if (data?.alertas) {
          this.disponible.set(true);
          this.agregar([data.alertas], 1);
        }
      },
      error: (e: unknown) => this.caida(e),
      complete: () => this.caida(undefined),
    });
  }

  private caida(error: unknown): void {
    if (this.terminada || this.reintento) return;
    this.suscripcion?.unsubscribe();
    this.suscripcion = undefined;
    this.disponible.set(false);
    if (codigoCierre(error) === CIERRE_SIN_PERMISO) return;
    this.reintento = setTimeout(() => void this.reconectar(), esperaReconexion(this.intento++));
  }

  private async reconectar(): Promise<void> {
    await this.sesion.renovar();
    this.reintento = undefined;
    if (this.terminada) return;
    await this.ponerseAlDia();
    this.suscribir();
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
