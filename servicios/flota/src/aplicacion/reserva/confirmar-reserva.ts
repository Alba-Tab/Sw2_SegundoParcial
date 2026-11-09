import { confirmar } from '../../dominio/reserva/reserva-unidad';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';

/** Actividad Flota.confirmarReserva (spec 003, paso 5): PROVISIONAL → CONFIRMADA. Idempotente; después del pivote. */
export class ConfirmarReserva {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly reservas: ReservaUnidadRepositorio,
  ) {}

  ejecutar(e: { reservaUnidadId: string; servicioId: string }): Promise<void> {
    return this.tx.ejecutar(async () => {
      const r = await this.reservas.porServicio(e.servicioId);
      if (!r || r.reservaUnidadId !== e.reservaUnidadId) {
        throw new Error(`No existe la reserva ${e.reservaUnidadId} del servicio ${e.servicioId}`);
      }
      if (r.estado === 'CONFIRMADA') return;
      await this.reservas.actualizar(confirmar(r));
    });
  }
}
