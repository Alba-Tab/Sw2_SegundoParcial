import { Injectable, signal } from '@angular/core';

/** D99: reconexión con espera creciente 1, 2, 4… s, máximo 30 s. */
export const esperaReconexion = (intento: number) => Math.min(30_000, 1000 * 2 ** intento);

/** Estado del WebSocket de la suscripción: la campana pide `alertasPendientes` cada vez que se reconecta. */
@Injectable({ providedIn: 'root' })
export class EstadoConexion {
  readonly conectado = signal(false);
  readonly reconexiones = signal(0);
}
