import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { Chofer } from '../../dominio/unidad/chofer';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';

const VEN_TODOS = ['jefe_flota', 'despachador', 'gerente'];

/** GET /choferes y /choferes/{id}: lectura para el Centro de Control; un chofer solo se ve a sí mismo. */
export class ConsultarChoferes {
  constructor(private readonly choferes: ChoferRepositorio) {}

  async listar(roles: string[], filtro: { activo?: boolean }, despuesDe: string | undefined, limite: number) {
    if (!roles.some((r) => VEN_TODOS.includes(r))) throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver choferes');
    return this.choferes.listar(filtro, despuesDe, limite);
  }

  async porId(usuario: { sub: string; roles: string[] }, choferId: string): Promise<Chofer> {
    const c = await this.choferes.porId(choferId);
    if (!c) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe el chofer');
    const propio = usuario.roles.includes('chofer') && c.usuarioSub === usuario.sub;
    if (!propio && !usuario.roles.some((r) => VEN_TODOS.includes(r))) {
      throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver este chofer');
    }
    return c;
  }
}
