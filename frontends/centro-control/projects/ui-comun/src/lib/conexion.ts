import { Injectable, signal } from '@angular/core';

/** D99: reconexión con espera creciente 1, 2, 4… s, máximo 30 s. */
export const esperaReconexion = (intento: number) => Math.min(30_000, 1000 * 2 ** intento);

/** Estado del WebSocket de la suscripción: la campana pide `alertasPendientes` cada vez que se conecta. */
@Injectable({ providedIn: 'root' })
export class EstadoConexion {
  readonly conectado = signal(false);
  /** Cada `connection_ack`, también el primero y los de una suscripción nueva después de un cierre fatal. */
  readonly conexiones = signal(0);
  readonly reconexiones = signal(0);
}
