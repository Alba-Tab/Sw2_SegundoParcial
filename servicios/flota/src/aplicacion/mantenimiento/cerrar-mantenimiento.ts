import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { type Cierre, cerrar, type Mantenimiento } from '../../dominio/mantenimiento/mantenimiento';
import { mantenimientoRequerido } from '../../dominio/unidad/mantenimiento';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { MantenimientoRepositorio } from '../puertos/mantenimiento-repositorio';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/**
 * POST /mantenimientos/{id}/cierre (spec 010, paso 7). En una transacción: Mantenimiento CERRADO y la unidad DISPONIBLE,
 * o MANTENIMIENTO_PENDIENTE con otro MantenimientoRequerido si todavía cumple la regla C.
 */
export class CerrarMantenimiento {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly unidades: UnidadRepositorio,
    private readonly mantenimientos: MantenimientoRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(mantenimientoId: string, p: Peticion<Cierre>): Promise<Mantenimiento> {
    soloJefeFlota(p.usuario.roles);
    const op = { clave: p.clave, operacion: `cerrarMantenimiento:${mantenimientoId}`, hashCuerpo: p.hashCuerpo };
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, op, async () => {
        const m = await this.mantenimientos.porId(mantenimientoId);
        if (!m) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe el mantenimiento');
        const u = await this.unidades.porId(m.unidadId);
        if (!u) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la unidad del mantenimiento');
        const r = cerrar(m, u, p.cuerpo, this.reloj.hoy(), this.reloj.ahora());
        await this.mantenimientos.guardar(r.mantenimiento);
        await this.unidades.guardar(r.unidad);
        if (r.revision.motivos.length) {
          await this.eventos.registrar(
            'MantenimientoRequerido',
            'flota.mantenimiento-requerido.v1',
            mantenimientoRequerido(r.unidad, r.revision),
          );
        }
        return r.mantenimiento;
      }),
    );
  }
}
