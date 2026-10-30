import { mantenimientoRequerido, revisar } from '../../dominio/unidad/mantenimiento';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/**
 * Revisión diaria (D75, spec 010 paso 5): los documentos vencen aunque la unidad no viaje. Cada unidad DISPONIBLE que
 * cumple la regla C pasa a MANTENIMIENTO_PENDIENTE con MantenimientoRequerido, en su propia transacción y releyendo el
 * estado (una reserva o una segunda réplica del worker pudieron cambiarla). Devuelve las placas que cambiaron.
 */
export class RevisarDocumentos {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly unidades: UnidadRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(): Promise<string[]> {
    const hoy = this.reloj.hoy();
    const cambiadas: string[] = [];
    for (const { unidadId } of await this.unidades.disponibles()) {
      const placa = await this.tx.ejecutar(async () => {
        const u = await this.unidades.porId(unidadId);
        if (u?.estado !== 'DISPONIBLE') return null;
        const revision = revisar(u, hoy);
        if (!revision.motivos.length) return null;
        const pendiente = { ...u, estado: 'MANTENIMIENTO_PENDIENTE' as const };
        await this.unidades.guardar(pendiente);
        await this.eventos.registrar(
          'MantenimientoRequerido',
          'flota.mantenimiento-requerido.v1',
          mantenimientoRequerido(pendiente, revision),
        );
        return u.placa;
      });
      if (placa) cambiadas.push(placa);
    }
    return cambiadas;
  }
}
