import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { Chofer } from '../../dominio/unidad/chofer';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';

export interface CambioChofer {
  licenciaCategoria?: 'A' | 'B' | 'C';
  licenciaVenceEl?: string;
  activo?: boolean;
  nombre?: string;
}

export type ChoferVersionado = Chofer & { versionAgregado: number };

/** El chofer de `choferId` con su versión (1 si la semilla no la trae); NO_ENCONTRADO si no existe. */
export async function choferConVersion(choferes: ChoferRepositorio, choferId: string): Promise<ChoferVersionado> {
  const actual = await choferes.porId(choferId);
  if (!actual) throw new ErrorDeDominio('NO_ENCONTRADO', `No existe el chofer ${choferId}`);
  return { versionAgregado: 1, ...actual };
}

/**
 * Guarda el chofer con `versionAgregado + 1` y deja ChoferActualizado en el Outbox. Se llama dentro de la transacción
 * del caso de uso (Analítica descarta versiones viejas, 000 §6).
 */
export async function guardarConEvento(
  choferes: ChoferRepositorio,
  eventos: RegistroDeEventos,
  chofer: ChoferVersionado,
): Promise<ChoferVersionado> {
  const nuevo = { ...chofer, versionAgregado: chofer.versionAgregado + 1 };
  await choferes.guardar(nuevo);
  await eventos.registrar('ChoferActualizado', 'flota.chofer-actualizado.v1', {
    choferId: nuevo.choferId,
    versionAgregado: nuevo.versionAgregado,
    nombre: nuevo.nombre,
    usuarioSub: nuevo.usuarioSub,
    licenciaCategoria: nuevo.licenciaCategoria,
    licenciaVenceEl: nuevo.licenciaVenceEl,
    activo: nuevo.activo,
  });
  return nuevo;
}

/**
 * Comando choferes:actualizar de la CLI (spec 010, sección D): guarda el cambio, sube versionAgregado y deja
 * ChoferActualizado en el Outbox en la misma transacción.
 */
export class ActualizarChofer {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly choferes: ChoferRepositorio,
    private readonly eventos: RegistroDeEventos,
  ) {}

  ejecutar(choferId: string, cambio: CambioChofer): Promise<number> {
    return this.tx.ejecutar(async () => {
      const actual = await choferConVersion(this.choferes, choferId);
      return (await guardarConEvento(this.choferes, this.eventos, { ...actual, ...cambio })).versionAgregado;
    });
  }
}
