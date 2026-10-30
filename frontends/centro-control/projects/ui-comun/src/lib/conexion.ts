import { Injectable, signal } from '@angular/core';

/** Estado del WebSocket de la suscripción: la campana pide `alertasPendientes` cada vez que se reconecta. */
@Injectable({ providedIn: 'root' })
export class EstadoConexion {
  readonly conectado = signal(false);
  readonly reconexiones = signal(0);
}
