import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { CombustibleRepositorio } from '../puertos/combustible-repositorio';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

const VEN_CARGAS = ['jefe_flota', 'gerente', 'despachador'];
const VEN_LECTURAS = ['jefe_flota', 'gerente'];
const MAXIMO_LECTURAS_MS = 24 * 3_600_000;

/** GET /cargas-combustible (el chofer solo las suyas) y /unidades/{id}/lecturas-combustible (24 h como máximo). */
export class ConsultarCombustible {
  constructor(
    private readonly combustible: CombustibleRepositorio,
    private readonly unidades: UnidadRepositorio,
    private readonly choferes: ChoferRepositorio,
  ) {}

  async cargas(
    usuario: { sub: string; roles: string[] },
    filtro: { tractoId?: string; desde?: string; hasta?: string },
    despuesDe: string | undefined,
    limite: number,
  ) {
    if (usuario.roles.some((r) => VEN_CARGAS.includes(r))) return this.combustible.listarCargas(filtro, despuesDe, limite);
    if (!usuario.roles.includes('chofer')) throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver cargas');
    const chofer = await this.choferes.porUsuarioSub(usuario.sub);
    if (!chofer) return [];
    return this.combustible.listarCargas({ ...filtro, choferId: chofer.choferId }, despuesDe, limite);
  }

  async lecturas(roles: string[], unidadId: string, desde: string, hasta?: string) {
    if (!roles.some((r) => VEN_LECTURAS.includes(r))) throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver lecturas');
    const fin = hasta ?? new Date(Date.parse(desde) + MAXIMO_LECTURAS_MS).toISOString();
    if (Date.parse(fin) - Date.parse(desde) > MAXIMO_LECTURAS_MS || Date.parse(fin) < Date.parse(desde)) {
      throw new ErrorDeDominio('VALIDACION', 'hasta: como máximo 24 h después de desde', { campo: 'hasta' });
    }
    const u = await this.unidades.porId(unidadId);
    if (!u) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la unidad');
    const items = await this.combustible.lecturasDesde(u.placa, desde, fin);
    return {
      unidadId: u.unidadId,
      placa: u.placa,
      ...(u.atributos.capacidadTanqueLitros ? { capacidadLitros: Number(u.atributos.capacidadTanqueLitros) } : {}),
      items: items.map(({ nivelPct, velocidadKmh, medidoEn }) => ({ nivelPct, velocidadKmh, medidoEn })),
    };
  }
}
