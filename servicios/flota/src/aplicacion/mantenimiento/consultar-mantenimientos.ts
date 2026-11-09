import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { EstadoMantenimiento, Mantenimiento } from '../../dominio/mantenimiento/mantenimiento';
import type { MantenimientoRepositorio } from '../puertos/mantenimiento-repositorio';

const PUEDEN_VER = ['jefe_flota', 'despachador', 'gerente'];

/** GET /mantenimientos (spec 010): jefe de flota, despachador y gerente. */
export class ConsultarMantenimientos {
  constructor(private readonly mantenimientos: MantenimientoRepositorio) {}

  listar(
    roles: string[],
    filtro: { unidadId?: string; estado?: EstadoMantenimiento },
    antesDe: string | undefined,
    limite: number,
  ): Promise<Mantenimiento[]> {
    if (!roles.some((r) => PUEDEN_VER.includes(r))) throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver mantenimientos');
    return this.mantenimientos.listar(filtro, antesDe, limite);
  }
}
