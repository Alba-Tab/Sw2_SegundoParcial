import { Module } from '@nestjs/common';
import { ProcesarLectura } from './aplicacion/combustible/procesar-lectura';
import { CHOFER_REPOSITORIO, type ChoferRepositorio } from './aplicacion/puertos/chofer-repositorio';
import { COMBUSTIBLE_REPOSITORIO, type CombustibleRepositorio } from './aplicacion/puertos/combustible-repositorio';
import { INBOX, type Inbox } from './aplicacion/puertos/inbox';
import { REGISTRO_DE_EVENTOS, type RegistroDeEventos } from './aplicacion/puertos/registro-de-eventos';
import { RELOJ, type Reloj } from './aplicacion/puertos/reloj';
import { RESERVA_UNIDAD_REPOSITORIO, type ReservaUnidadRepositorio } from './aplicacion/puertos/reserva-unidad-repositorio';
import { UNIDAD_DE_TRABAJO, type UnidadDeTrabajo } from './aplicacion/puertos/unidad-de-trabajo';
import { UNIDAD_REPOSITORIO, type UnidadRepositorio } from './aplicacion/puertos/unidad-repositorio';
import { ConfirmarReserva } from './aplicacion/reserva/confirmar-reserva';
import { LiberarPorCancelacion } from './aplicacion/reserva/liberar-por-cancelacion';
import { LiberarPorEntrega } from './aplicacion/reserva/liberar-por-entrega';
import { LiberarReserva } from './aplicacion/reserva/liberar-reserva';
import { PonerEnViaje } from './aplicacion/reserva/poner-en-viaje';
import { ReservarUnidad } from './aplicacion/reserva/reservar-unidad';
import { ComunModule } from './infraestructura/comun.module';
import { ConsumidorEventos } from './infraestructura/mensajeria/consumidor-eventos';
import { RelayOutbox } from './infraestructura/mensajeria/relay-outbox';
import { ActividadesFlota } from './infraestructura/temporal/actividades-flota';
import { TrabajadorTemporal } from './infraestructura/temporal/trabajador-temporal';

const DEPENDENCIAS = [UNIDAD_DE_TRABAJO, UNIDAD_REPOSITORIO, CHOFER_REPOSITORIO, RESERVA_UNIDAD_REPOSITORIO];

/** Worker de Flota (Cloud Run worker pool, siempre encendido): relay del Outbox, actividades Flota.* y consumidor de flota.eventos. */
@Module({
  imports: [ComunModule],
  providers: [
    RelayOutbox,
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
    {
      provide: LiberarPorCancelacion,
      inject: [UNIDAD_DE_TRABAJO, INBOX, LiberarReserva],
      useFactory: (tx: UnidadDeTrabajo, inbox: Inbox, liberar: LiberarReserva) => new LiberarPorCancelacion(tx, inbox, liberar),
    },
    {
      provide: PonerEnViaje,
      inject: [UNIDAD_DE_TRABAJO, INBOX, RESERVA_UNIDAD_REPOSITORIO, UNIDAD_REPOSITORIO],
      useFactory: (tx: UnidadDeTrabajo, inbox: Inbox, r: ReservaUnidadRepositorio, u: UnidadRepositorio) =>
        new PonerEnViaje(tx, inbox, r, u),
    },
    {
      provide: LiberarPorEntrega,
      inject: [UNIDAD_DE_TRABAJO, INBOX, RESERVA_UNIDAD_REPOSITORIO, UNIDAD_REPOSITORIO, CHOFER_REPOSITORIO, REGISTRO_DE_EVENTOS, RELOJ],
      useFactory: (
        tx: UnidadDeTrabajo,
        inbox: Inbox,
        r: ReservaUnidadRepositorio,
        u: UnidadRepositorio,
        c: ChoferRepositorio,
        e: RegistroDeEventos,
        reloj: Reloj,
      ) => new LiberarPorEntrega(tx, inbox, r, u, c, e, reloj),
    },
    {
      provide: ProcesarLectura,
      inject: [UNIDAD_DE_TRABAJO, COMBUSTIBLE_REPOSITORIO, UNIDAD_REPOSITORIO, RESERVA_UNIDAD_REPOSITORIO, REGISTRO_DE_EVENTOS],
      useFactory: (
        tx: UnidadDeTrabajo,
        k: CombustibleRepositorio,
        u: UnidadRepositorio,
        r: ReservaUnidadRepositorio,
        e: RegistroDeEventos,
      ) => new ProcesarLectura(tx, k, u, r, e),
    },
    ActividadesFlota,
    TrabajadorTemporal,
    ConsumidorEventos,
  ],
})
export class WorkerModule {}
