import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { Unidad } from '../../dominio/unidad/unidad';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

const PUEDEN_VER = ['jefe_flota', 'despachador', 'gerente', 'agente_lectura'];

/** GET /unidades y /unidades/{id} (spec 010): jefe de flota, despachador, gerente y agente (spec 014). */
export class ConsultarUnidades {
  constructor(private readonly unidades: UnidadRepositorio) {}

  async listar(roles: string[], filtro: { tipo?: string; estado?: string }, despuesDe: string | undefined, limite: number) {
    this.autorizar(roles);
    return this.unidades.listar(filtro, despuesDe, limite);
  }

  async porId(roles: string[], unidadId: string): Promise<Unidad> {
    this.autorizar(roles);
    const u = await this.unidades.porId(unidadId);
    if (!u) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la unidad');
    return u;
  }

  private autorizar(roles: string[]) {
    if (!roles.some((r) => PUEDEN_VER.includes(r))) throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver unidades');
  }
}
