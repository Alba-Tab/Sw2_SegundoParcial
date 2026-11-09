import type { EstadoMantenimiento, Mantenimiento } from '../../dominio/mantenimiento/mantenimiento';

export interface MantenimientoRepositorio {
  porId(mantenimientoId: string): Promise<Mantenimiento | null>;
  insertar(m: Mantenimiento): Promise<void>;
  guardar(m: Mantenimiento): Promise<void>;
  /** Del más reciente al más antiguo (los ids son UUIDv7). */
  listar(
    filtro: { unidadId?: string; estado?: EstadoMantenimiento },
    antesDe: string | undefined,
    limite: number,
  ): Promise<Mantenimiento[]>;
}
export const MANTENIMIENTO_REPOSITORIO = Symbol('MantenimientoRepositorio');
