import { liberarDespuesDelViaje, mantenimientoRequerido } from '../../dominio/unidad/mantenimiento';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { Inbox } from '../puertos/inbox';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

export interface SobreFinDeViaje {
  id: string;
  tipo: 'EntregaConfirmada' | 'EntregaRechazada';
  datos: { servicioId: string; tractoId: string; remolqueId: string; choferId: string; kmRecorridos: number };
}

/**
 * Consumidor de EntregaConfirmada y EntregaRechazada (specs 006, 007 y 010, D07). En la transacción del Inbox: reserva
 * LIBERADA; tracto y remolque suman kmRecorridos y pasan a DISPONIBLE o MANTENIMIENTO_PENDIENTE (con
 * MantenimientoRequerido en el Outbox); el chofer queda disponible. Las unidades y el chofer salen de la reserva del
 * servicio, no del evento; si la reserva no existe o ya está LIBERADA no se toca nada: un fin de viaje repetido con otro
 * eventId no suma los km dos veces ni libera unidades de otra reserva (D11).
 */
export class LiberarPorEntrega {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly inbox: Inbox,
    private readonly reservas: ReservaUnidadRepositorio,
    private readonly unidades: UnidadRepositorio,
    private readonly choferes: ChoferRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  ejecutar(sobre: SobreFinDeViaje): Promise<boolean> {
    return this.tx.ejecutar(async () => {
      if (!(await this.inbox.registrar(sobre.id, sobre.tipo))) return false;
      const r = await this.reservas.porServicio(sobre.datos.servicioId);
      if (!r || r.estado === 'LIBERADA') return true;
      await this.reservas.actualizar({ ...r, estado: 'LIBERADA' });
      const hoy = this.reloj.hoy();
      for (const id of [r.tractoId, r.remolqueId]) {
        const u = id ? await this.unidades.porId(id) : null;
        const fin = u && liberarDespuesDelViaje(u, sobre.datos.kmRecorridos, hoy);
        if (!fin) continue;
        await this.unidades.guardar(fin.unidad);
        if (fin.revision.motivos.length) {
          await this.eventos.registrar(
            'MantenimientoRequerido',
            'flota.mantenimiento-requerido.v1',
            mantenimientoRequerido(fin.unidad, fin.revision),
          );
        }
      }
      if (r.choferId) await this.choferes.devolver(r.choferId);
      return true;
    });
  }
}
