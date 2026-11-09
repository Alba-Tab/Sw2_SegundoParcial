import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { uuid7 } from '../../dominio/comun/uuid7';
import { type Mantenimiento, type MantenimientoNuevo, programar } from '../../dominio/mantenimiento/mantenimiento';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { MantenimientoRepositorio } from '../puertos/mantenimiento-repositorio';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/** POST /unidades/{unidadId}/mantenimientos (spec 010, paso 6): Mantenimiento EN_CURSO y unidad EN_MANTENIMIENTO. */
export class ProgramarMantenimiento {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly unidades: UnidadRepositorio,
    private readonly mantenimientos: MantenimientoRepositorio,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(unidadId: string, p: Peticion<MantenimientoNuevo>): Promise<Mantenimiento> {
    soloJefeFlota(p.usuario.roles);
    const op = { clave: p.clave, operacion: `programarMantenimiento:${unidadId}`, hashCuerpo: p.hashCuerpo };
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, op, async () => {
        const u = await this.unidades.porId(unidadId);
        if (!u) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la unidad');
        const { unidad, mantenimiento } = programar(u, p.cuerpo, uuid7(), this.reloj.hoy(), this.reloj.ahora(), p.usuario.sub);
        await this.unidades.guardar(unidad);
        await this.mantenimientos.insertar(mantenimiento);
        return mantenimiento;
      }),
    );
  }
}
