import { Inject, Injectable } from '@nestjs/common';
import { ApplicationFailure } from '@temporalio/common';
import { ConfirmarReserva } from '../../aplicacion/reserva/confirmar-reserva';
import { LiberarReserva } from '../../aplicacion/reserva/liberar-reserva';
import { ReservarUnidad, type ReservaHecha, type ReservarUnidadEntrada } from '../../aplicacion/reserva/reservar-unidad';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';

/** Códigos que Temporal reintenta (contrato: "Errores"); cualquier otro ErrorDeDominio es de negocio y no se reintenta. */
const REINTENTABLES = new Set(['DEPENDENCIA_NO_DISPONIBLE']);

/**
 * Actividades Flota.* de la saga ProgramarViaje (contratos/temporal/programar-viaje.md), cola `flota`. Un
 * ErrorDeDominio sale como ApplicationFailure con `type` = código y un DetalleFallo (S9).
 */
@Injectable()
export class ActividadesFlota {
  constructor(
    @Inject(ReservarUnidad) private readonly reservar: ReservarUnidad,
    @Inject(ConfirmarReserva) private readonly confirmar: ConfirmarReserva,
    @Inject(LiberarReserva) private readonly liberar: LiberarReserva,
  ) {}

  /** Nombres explícitos del contrato (S14). */
  mapa() {
    return {
      'Flota.reservarUnidad': (e: ReservarUnidadEntrada): Promise<ReservaHecha> => traducir(() => this.reservar.ejecutar(e)),
      'Flota.confirmarReserva': (e: { reservaUnidadId: string; servicioId: string }): Promise<void> =>
        traducir(() => this.confirmar.ejecutar(e)),
      'Flota.liberarReserva': (e: { servicioId: string; reservaUnidadId?: string }): Promise<void> =>
        traducir(() => this.liberar.ejecutar(e)),
    };
  }
}

async function traducir<T>(actividad: () => Promise<T>): Promise<T> {
  try {
    return await actividad();
  } catch (e) {
    if (!(e instanceof ErrorDeDominio)) throw e;
    throw ApplicationFailure.create({
      type: e.codigo,
      message: e.message,
      nonRetryable: !REINTENTABLES.has(e.codigo),
      details: [{ codigo: e.codigo, mensaje: e.message, ...(e.datos ? { datos: e.datos } : {}) }],
    });
  }
}
