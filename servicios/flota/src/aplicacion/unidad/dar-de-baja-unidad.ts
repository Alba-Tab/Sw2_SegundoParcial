import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { darDeBaja } from '../../dominio/unidad/gestion';
import type { Unidad } from '../../dominio/unidad/unidad';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

/** POST /unidades/{unidadId}/baja (spec 010, paso 3): INACTIVA, que es final. */
export class DarDeBajaUnidad {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly unidades: UnidadRepositorio,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(unidadId: string, p: Peticion<{ motivo: string }>): Promise<Unidad> {
    soloJefeFlota(p.usuario.roles);
    const op = { clave: p.clave, operacion: `darDeBajaUnidad:${unidadId}`, hashCuerpo: p.hashCuerpo };
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, op, async () => {
        const u = await this.unidades.porId(unidadId);
        if (!u) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la unidad');
        const inactiva = darDeBaja(u, p.cuerpo.motivo, this.reloj.ahora());
        await this.unidades.guardar(inactiva);
        return inactiva;
      }),
    );
  }
}
