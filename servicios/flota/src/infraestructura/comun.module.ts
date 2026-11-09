import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { CHOFER_REPOSITORIO } from '../aplicacion/puertos/chofer-repositorio';
import { COMBUSTIBLE_REPOSITORIO } from '../aplicacion/puertos/combustible-repositorio';
import { INBOX } from '../aplicacion/puertos/inbox';
import { MANTENIMIENTO_REPOSITORIO } from '../aplicacion/puertos/mantenimiento-repositorio';
import { OPERACIONES_IDEMPOTENTES } from '../aplicacion/puertos/operaciones-idempotentes';
import { REGISTRO_DE_EVENTOS } from '../aplicacion/puertos/registro-de-eventos';
import { RELOJ } from '../aplicacion/puertos/reloj';
import { RESERVA_UNIDAD_REPOSITORIO } from '../aplicacion/puertos/reserva-unidad-repositorio';
import { UNIDAD_DE_TRABAJO } from '../aplicacion/puertos/unidad-de-trabajo';
import { UNIDAD_REPOSITORIO } from '../aplicacion/puertos/unidad-repositorio';
import { entorno } from './configuracion/entorno';
import { ConexionAmqp } from './mensajeria/conexion-amqp';
import { ValidadorEventos } from './mensajeria/validador-eventos';
import { opcionesLog } from './observabilidad/logger';
import { ChoferRepositorioMongo, ReservaUnidadRepositorioMongo, UnidadRepositorioMongo } from './persistencia/colecciones-flota';
import { CombustibleRepositorioMongo } from './persistencia/combustible-mongo';
import { InboxMongo } from './persistencia/inbox-mongo';
import { MantenimientoRepositorioMongo, OperacionesIdempotentesMongo } from './persistencia/mantenimiento-mongo';
import { MongoUnidadDeTrabajo } from './persistencia/mongo-unidad-de-trabajo';
import { RegistroDeEventosMongo } from './persistencia/registro-de-eventos-mongo';
import { RelojSistema } from './persistencia/reloj-sistema';

const PUERTOS = [
  { provide: UNIDAD_DE_TRABAJO, useClass: MongoUnidadDeTrabajo },
  { provide: REGISTRO_DE_EVENTOS, useClass: RegistroDeEventosMongo },
  { provide: UNIDAD_REPOSITORIO, useClass: UnidadRepositorioMongo },
  { provide: CHOFER_REPOSITORIO, useClass: ChoferRepositorioMongo },
  { provide: RESERVA_UNIDAD_REPOSITORIO, useClass: ReservaUnidadRepositorioMongo },
  { provide: INBOX, useClass: InboxMongo },
  { provide: RELOJ, useClass: RelojSistema },
  { provide: COMBUSTIBLE_REPOSITORIO, useClass: CombustibleRepositorioMongo },
  { provide: MANTENIMIENTO_REPOSITORIO, useClass: MantenimientoRepositorioMongo },
  { provide: OPERACIONES_IDEMPOTENTES, useClass: OperacionesIdempotentesMongo },
];

/** Lo que comparten la API, el worker y la CLI: logs, Mongo, AMQP, la validación de eventos y los adaptadores de los puertos. */
@Module({
  imports: [
    LoggerModule.forRoot(opcionesLog('flota')),
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: entorno().MONGO_URI, serverSelectionTimeoutMS: 5000 }) }),
  ],
  providers: [ConexionAmqp, ValidadorEventos, ...PUERTOS],
  exports: [ConexionAmqp, ValidadorEventos, ...PUERTOS.map((p) => p.provide)],
})
export class ComunModule {}
