import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';

export interface CambioChofer {
  licenciaCategoria?: 'A' | 'B' | 'C';
  licenciaVenceEl?: string;
  activo?: boolean;
  nombre?: string;
}

/**
 * Comando choferes:actualizar (spec 010, sección D): no hay API de escritura de choferes. Guarda el cambio, sube
 * versionAgregado y deja ChoferActualizado en el Outbox en la misma transacción (Analítica descarta versiones viejas).
 */
export class ActualizarChofer {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly choferes: ChoferRepositorio,
    private readonly eventos: RegistroDeEventos,
  ) {}

  ejecutar(choferId: string, cambio: CambioChofer): Promise<number> {
    return this.tx.ejecutar(async () => {
      const actual = await this.choferes.porId(choferId);
      if (!actual) throw new ErrorDeDominio('NO_ENCONTRADO', `No existe el chofer ${choferId}`);
      const version = ((actual as { versionAgregado?: number }).versionAgregado ?? 1) + 1;
      const nuevo = { ...actual, ...cambio, versionAgregado: version };
      await this.choferes.guardar(nuevo);
      await this.eventos.registrar('ChoferActualizado', 'flota.chofer-actualizado.v1', {
        choferId: nuevo.choferId,
        versionAgregado: version,
        nombre: nuevo.nombre,
        usuarioSub: nuevo.usuarioSub,
        licenciaCategoria: nuevo.licenciaCategoria,
        licenciaVenceEl: nuevo.licenciaVenceEl,
        activo: nuevo.activo,
      });
      return version;
    });
  }
}
