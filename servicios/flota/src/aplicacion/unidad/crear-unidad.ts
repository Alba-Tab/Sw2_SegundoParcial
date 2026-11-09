import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { uuid7 } from '../../dominio/comun/uuid7';
import { type UnidadNueva, nuevaUnidad } from '../../dominio/unidad/gestion';
import { mantenimientoRequerido } from '../../dominio/unidad/mantenimiento';
import type { Unidad } from '../../dominio/unidad/unidad';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/** POST /unidades (spec 010, paso 1). Si la unidad nace MANTENIMIENTO_PENDIENTE, deja MantenimientoRequerido. */
export class CrearUnidad {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly unidades: UnidadRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(p: Peticion<UnidadNueva>): Promise<Unidad> {
    soloJefeFlota(p.usuario.roles);
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, { clave: p.clave, operacion: 'crearUnidad', hashCuerpo: p.hashCuerpo }, async () => {
        if (await this.unidades.porPlaca(p.cuerpo.placa)) {
          throw new ErrorDeDominio('PLACA_DUPLICADA', `Ya existe una unidad con la placa ${p.cuerpo.placa}`, { campo: 'placa' });
        }
        const { unidad, revision } = nuevaUnidad(p.cuerpo, uuid7(), this.reloj.hoy());
        await this.unidades.insertar(unidad);
        if (revision.motivos.length) {
          await this.eventos.registrar(
            'MantenimientoRequerido',
            'flota.mantenimiento-requerido.v1',
            mantenimientoRequerido(unidad, revision),
          );
        }
        return unidad;
      }),
    );
  }
}
