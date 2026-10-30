import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { type EdicionUnidad, editarUnidad } from '../../dominio/unidad/gestion';
import type { Unidad } from '../../dominio/unidad/unidad';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/** PUT /unidades/{unidadId} (spec 010, paso 2). */
export class ActualizarUnidad {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly unidades: UnidadRepositorio,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(unidadId: string, p: Peticion<EdicionUnidad>): Promise<Unidad> {
    soloJefeFlota(p.usuario.roles);
    const op = { clave: p.clave, operacion: `actualizarUnidad:${unidadId}`, hashCuerpo: p.hashCuerpo };
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, op, async () => {
        const u = await this.unidades.porId(unidadId);
        if (!u) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la unidad');
        const editada = editarUnidad(u, p.cuerpo, this.reloj.hoy());
        await this.unidades.guardar(editada);
        return editada;
      }),
    );
  }
}
