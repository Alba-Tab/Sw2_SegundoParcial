import { cambiarHabilitacion } from '../../dominio/unidad/chofer';
import { conIdempotencia, type Peticion, soloJefeFlota } from '../comun/idempotencia';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { OperacionesIdempotentes } from '../puertos/operaciones-idempotentes';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import { choferConVersion, guardarConEvento, type ChoferVersionado } from './actualizar-chofer';

/**
 * POST /choferes/{choferId}/habilitacion (D104). Una reserva que toma al chofer a la vez choca con esta transacción
 * (conflicto de escritura en Mongo, que la transacción reintenta): la segunda lectura ya ve `disponible = false` y
 * responde 409 CONFLICTO_ESTADO.
 */
export class CambiarHabilitacionChofer {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly operaciones: OperacionesIdempotentes,
    private readonly choferes: ChoferRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(choferId: string, p: Peticion<{ activo: boolean; motivo?: string }>): Promise<ChoferVersionado> {
    soloJefeFlota(p.usuario.roles);
    const op = { clave: p.clave, operacion: `cambiarHabilitacionChofer:${choferId}`, hashCuerpo: p.hashCuerpo };
    return this.tx.ejecutar(() =>
      conIdempotencia(this.operaciones, op, async () => {
        const actual = await choferConVersion(this.choferes, choferId);
        const nuevo = cambiarHabilitacion(actual, p.cuerpo.activo, p.cuerpo.motivo, this.reloj.ahora());
        return guardarConEvento(this.choferes, this.eventos, { ...nuevo, versionAgregado: actual.versionAgregado });
      }),
    );
  }
}
