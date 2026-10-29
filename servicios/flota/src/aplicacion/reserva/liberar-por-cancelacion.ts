import type { Inbox } from '../puertos/inbox';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { LiberarReserva } from './liberar-reserva';

export interface SobreViajeCancelado {
  id: string;
  tipo: 'ViajeCancelado';
  datos: { servicioId: string; origen: 'SAGA' | 'USUARIO' };
}

/**
 * Consumidor de ViajeCancelado (spec 004): libera tracto, remolque y chofer del servicio, venga de un usuario o de la
 * saga (así se liberan solas las reservas de una intervención resuelta a mano, spec 011). El Inbox y la liberación van
 * en la misma transacción: un evento repetido no libera dos veces.
 */
export class LiberarPorCancelacion {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly inbox: Inbox,
    private readonly liberar: LiberarReserva,
  ) {}

  /** @returns false si el evento ya se había procesado */
  ejecutar(sobre: SobreViajeCancelado): Promise<boolean> {
    return this.tx.ejecutar(async () => {
      if (!(await this.inbox.registrar(sobre.id, sobre.tipo))) return false;
      await this.liberar.aplicar({ servicioId: sobre.datos.servicioId });
      return true;
    });
  }
}
