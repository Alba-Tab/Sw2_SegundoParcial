import type { Inbox } from '../puertos/inbox';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

export interface SobreViajeIniciado {
  id: string;
  tipo: 'ViajeIniciado';
  datos: { servicioId: string; tractoId: string; remolqueId: string };
}

/**
 * Consumidor de ViajeIniciado (spec 005, D20): tracto y remolque RESERVADA → EN_VIAJE, solo si la reserva del servicio
 * sigue activa. Un ViajeIniciado que llega después de la entrega (reserva ya LIBERADA) se ignora (spec 010).
 */
export class PonerEnViaje {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly inbox: Inbox,
    private readonly reservas: ReservaUnidadRepositorio,
    private readonly unidades: UnidadRepositorio,
  ) {}

  ejecutar(sobre: SobreViajeIniciado): Promise<boolean> {
    return this.tx.ejecutar(async () => {
      if (!(await this.inbox.registrar(sobre.id, sobre.tipo))) return false;
      const r = await this.reservas.porServicio(sobre.datos.servicioId);
      if (!r || r.estado === 'LIBERADA') return true;
      await this.unidades.ponerEnViaje(sobre.datos.tractoId);
      await this.unidades.ponerEnViaje(sobre.datos.remolqueId);
      return true;
    });
  }
}
