import { editarChofer, type Chofer } from '../../dominio/unidad/chofer';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import { choferConVersion, guardarConEvento, type ChoferVersionado } from './actualizar-chofer';

export type EdicionChofer = Pick<Chofer, 'nombre' | 'licenciaCategoria' | 'licenciaVenceEl'>;

/** PUT /choferes/{choferId} (D104): nombre y licencia; publica ChoferActualizado. */
export class EditarChofer {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly choferes: ChoferRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(choferId: string, p: Peticion<EdicionChofer>): Promise<ChoferVersionado> {
    soloJefeFlota(p.usuario.roles);
    const op = { clave: p.clave, operacion: `editarChofer:${choferId}`, hashCuerpo: p.hashCuerpo };
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, op, async () => {
        const actual = await choferConVersion(this.choferes, choferId);
        const editado = editarChofer(actual, p.cuerpo, this.reloj.hoy());
        return guardarConEvento(this.choferes, this.eventos, { ...editado, versionAgregado: actual.versionAgregado });
      }),
    );
  }
}
