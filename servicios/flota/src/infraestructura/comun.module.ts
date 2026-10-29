import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { REGISTRO_DE_EVENTOS } from '../aplicacion/puertos/registro-de-eventos';
import { UNIDAD_DE_TRABAJO } from '../aplicacion/puertos/unidad-de-trabajo';
import { entorno } from './configuracion/entorno';
import { ConexionAmqp } from './mensajeria/conexion-amqp';
import { opcionesLog } from './observabilidad/logger';
import { MongoUnidadDeTrabajo } from './persistencia/mongo-unidad-de-trabajo';
import { RegistroDeEventosMongo } from './persistencia/registro-de-eventos-mongo';

/** Lo que comparten la API y el worker: logs, Mongo, AMQP y los adaptadores de los puertos. */
@Module({
  imports: [
    LoggerModule.forRoot(opcionesLog('flota')),
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: entorno().MONGO_URI, serverSelectionTimeoutMS: 5000 }) }),
  ],
  providers: [
    ConexionAmqp,
    { provide: UNIDAD_DE_TRABAJO, useClass: MongoUnidadDeTrabajo },
    { provide: REGISTRO_DE_EVENTOS, useClass: RegistroDeEventosMongo },
  ],
  exports: [ConexionAmqp, UNIDAD_DE_TRABAJO, REGISTRO_DE_EVENTOS],
})
export class ComunModule {}
