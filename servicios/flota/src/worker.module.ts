import { Module } from '@nestjs/common';
import { CHOFER_REPOSITORIO, type ChoferRepositorio } from './aplicacion/puertos/chofer-repositorio';
import { RESERVA_UNIDAD_REPOSITORIO, type ReservaUnidadRepositorio } from './aplicacion/puertos/reserva-unidad-repositorio';
import { UNIDAD_DE_TRABAJO, type UnidadDeTrabajo } from './aplicacion/puertos/unidad-de-trabajo';
import { UNIDAD_REPOSITORIO, type UnidadRepositorio } from './aplicacion/puertos/unidad-repositorio';
import { ConfirmarReserva } from './aplicacion/reserva/confirmar-reserva';
import { LiberarReserva } from './aplicacion/reserva/liberar-reserva';
import { ReservarUnidad } from './aplicacion/reserva/reservar-unidad';
import { ComunModule } from './infraestructura/comun.module';
import { RelayOutbox } from './infraestructura/mensajeria/relay-outbox';
import {
  ChoferRepositorioMongo,
  ReservaUnidadRepositorioMongo,
  UnidadRepositorioMongo,
} from './infraestructura/persistencia/colecciones-flota';
import { ActividadesFlota } from './infraestructura/temporal/actividades-flota';
import { TrabajadorTemporal } from './infraestructura/temporal/trabajador-temporal';

const DEPENDENCIAS = [UNIDAD_DE_TRABAJO, UNIDAD_REPOSITORIO, CHOFER_REPOSITORIO, RESERVA_UNIDAD_REPOSITORIO];

/** Worker de Flota (Cloud Run worker pool, siempre encendido): relay del Outbox y las actividades Flota.* de Temporal. */
@Module({
  imports: [ComunModule],
  providers: [
    RelayOutbox,
    { provide: UNIDAD_REPOSITORIO, useClass: UnidadRepositorioMongo },
    { provide: CHOFER_REPOSITORIO, useClass: ChoferRepositorioMongo },
    { provide: RESERVA_UNIDAD_REPOSITORIO, useClass: ReservaUnidadRepositorioMongo },
    {
      provide: ReservarUnidad,
      inject: DEPENDENCIAS,
      useFactory: (tx: UnidadDeTrabajo, u: UnidadRepositorio, c: ChoferRepositorio, r: ReservaUnidadRepositorio) =>
        new ReservarUnidad(tx, u, c, r),
    },
    {
      provide: ConfirmarReserva,
      inject: [UNIDAD_DE_TRABAJO, RESERVA_UNIDAD_REPOSITORIO],
      useFactory: (tx: UnidadDeTrabajo, r: ReservaUnidadRepositorio) => new ConfirmarReserva(tx, r),
    },
    {
      provide: LiberarReserva,
      inject: DEPENDENCIAS,
      useFactory: (tx: UnidadDeTrabajo, u: UnidadRepositorio, c: ChoferRepositorio, r: ReservaUnidadRepositorio) =>
        new LiberarReserva(tx, u, c, r),
    },
    ActividadesFlota,
    TrabajadorTemporal,
  ],
})
export class WorkerModule {}
