import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { uuid7 } from '../../dominio/comun/uuid7';
import type { ReservaUnidad } from '../../dominio/reserva/reserva-unidad';
import { choferHabilitado, porChoferId } from '../../dominio/unidad/chofer';
import { porPrioridad, remolqueCompatible, reservable, type TipoCarga } from '../../dominio/unidad/unidad';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

export interface ReservarUnidadEntrada {
  servicioId: string;
  viajeId: string;
  tipoCarga: TipoCarga;
  toneladas: number;
  fechaViaje: string;
}

export interface ReservaHecha {
  reservaUnidadId: string;
  tractoId: string;
  remolqueId: string;
  placa: string;
  choferId: string;
  choferNombre: string;
  choferUsuarioSub: string;
}

/**
 * Actividad Flota.reservarUnidad (spec 003, paso 3; D11). En una transacción toma tracto, remolque compatible y chofer
 * habilitado con actualizaciones condicionales: dos sagas no pueden tomar la misma unidad. Idempotente por servicioId.
 */
export class ReservarUnidad {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly unidades: UnidadRepositorio,
    private readonly choferes: ChoferRepositorio,
    private readonly reservas: ReservaUnidadRepositorio,
  ) {}

  ejecutar(e: ReservarUnidadEntrada): Promise<ReservaHecha> {
    return this.tx.ejecutar(async () => {
      const previa = await this.reservas.porServicio(e.servicioId);
      if (previa?.estado === 'LIBERADA') {
        throw new ErrorDeDominio('CONFLICTO_ESTADO', 'La reserva de este servicio ya se liberó');
      }
      if (previa) return this.describir(previa);

      const disponibles = await this.unidades.disponibles();
      const tractos = disponibles.filter((u) => u.tipoUnidad === 'TRACTO' && reservable(u, e.fechaViaje)).sort(porPrioridad);
      const remolques = disponibles
        .filter((u) => remolqueCompatible(u, e.tipoCarga, e.toneladas) && reservable(u, e.fechaViaje))
        .sort(porPrioridad);
      const choferes = (await this.choferes.disponibles()).filter((c) => choferHabilitado(c, e.fechaViaje)).sort(porChoferId);

      const remolque = await this.primeraQueSeTome(remolques, (u) => this.unidades.tomar(u.unidadId));
      const tracto = await this.primeraQueSeTome(tractos, (u) => this.unidades.tomar(u.unidadId));
      const chofer = await this.primeraQueSeTome(choferes, (c) => this.choferes.tomar(c.choferId));
      if (!remolque || !tracto || !chofer) {
        const falta = !remolque ? `remolque ${e.tipoCarga} de ${e.toneladas} t` : !tracto ? 'tracto' : 'chofer con licencia C';
        throw new ErrorDeDominio('SIN_UNIDAD_COMPATIBLE', `No hay ${falta} disponible para el ${e.fechaViaje}`, {
          tipoCarga: e.tipoCarga,
          toneladas: e.toneladas,
          fechaViaje: e.fechaViaje,
        });
      }
      const reserva: ReservaUnidad = {
        reservaUnidadId: uuid7(),
        servicioId: e.servicioId,
        viajeId: e.viajeId,
        tractoId: tracto.unidadId,
        remolqueId: remolque.unidadId,
        choferId: chofer.choferId,
        estado: 'PROVISIONAL',
        creadaEn: new Date(),
      };
      await this.reservas.insertar(reserva);
      return {
        reservaUnidadId: reserva.reservaUnidadId,
        tractoId: tracto.unidadId,
        remolqueId: remolque.unidadId,
        placa: tracto.placa,
        choferId: chofer.choferId,
        choferNombre: chofer.nombre,
        choferUsuarioSub: chofer.usuarioSub,
      };
    });
  }

  /** La primera candidata que la actualización condicional logra tomar (otra saga pudo ganarla entre la lectura y aquí). */
  private async primeraQueSeTome<T>(candidatas: T[], tomar: (c: T) => Promise<boolean>): Promise<T | undefined> {
    for (const c of candidatas) if (await tomar(c)) return c;
    return undefined;
  }

  private async describir(r: ReservaUnidad): Promise<ReservaHecha> {
    const [tracto, chofer] = await Promise.all([this.unidades.porId(r.tractoId!), this.choferes.porId(r.choferId!)]);
    if (!tracto || !chofer) throw new Error(`Reserva ${r.reservaUnidadId} con unidad o chofer inexistente`);
    return {
      reservaUnidadId: r.reservaUnidadId,
      tractoId: tracto.unidadId,
      remolqueId: r.remolqueId!,
      placa: tracto.placa,
      choferId: chofer.choferId,
      choferNombre: chofer.nombre,
      choferUsuarioSub: chofer.usuarioSub,
    };
  }
}
