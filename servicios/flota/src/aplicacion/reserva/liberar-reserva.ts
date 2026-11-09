import { uuid7 } from '../../dominio/comun/uuid7';
import { aLiberar } from '../../dominio/reserva/reserva-unidad';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/**
 * Compensación Flota.liberarReserva (spec 003): reserva LIBERADA, tracto y remolque a DISPONIBLE y chofer libre. Si el
 * servicio no tiene reserva deja una lápida LIBERADA para que una reserva tardía no tome unidades.
 */
export class LiberarReserva {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly unidades: UnidadRepositorio,
    private readonly choferes: ChoferRepositorio,
    private readonly reservas: ReservaUnidadRepositorio,
  ) {}

  ejecutar(e: { servicioId: string; reservaUnidadId?: string }): Promise<void> {
    return this.tx.ejecutar(() => this.aplicar(e));
  }

  /** Lo mismo dentro de una transacción ya abierta (el consumidor de ViajeCancelado la abre con su Inbox). */
  async aplicar(e: { servicioId: string; reservaUnidadId?: string }): Promise<void> {
    const r = await this.reservas.porServicio(e.servicioId);
    if (!r) {
      await this.reservas.insertar({
        reservaUnidadId: e.reservaUnidadId ?? uuid7(),
        servicioId: e.servicioId,
        estado: 'LIBERADA',
        creadaEn: new Date(),
      });
      return;
    }
    const { unidades, choferId } = aLiberar(r);
    if (r.estado === 'LIBERADA') return;
    for (const u of unidades) await this.unidades.devolver(u);
    if (choferId) await this.choferes.devolver(choferId);
    await this.reservas.actualizar({ ...r, estado: 'LIBERADA' });
  }
}
