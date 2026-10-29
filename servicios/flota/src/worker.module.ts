import { Module } from '@nestjs/common';
import { ComunModule } from './infraestructura/comun.module';
import { RelayOutbox } from './infraestructura/mensajeria/relay-outbox';

/** Worker de Flota (Cloud Run worker pool, siempre encendido): relay del Outbox; en F4 suma Temporal y los consumidores. */
@Module({ imports: [ComunModule], providers: [RelayOutbox] })
export class WorkerModule {}
