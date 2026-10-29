import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import * as amqp from 'amqplib';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { REGISTRO_DE_EVENTOS, RegistroDeEventos } from '../../src/aplicacion/puertos/registro-de-eventos';
import { UNIDAD_DE_TRABAJO, UnidadDeTrabajo } from '../../src/aplicacion/puertos/unidad-de-trabajo';

/** Mismas versiones que plataforma/compose. Sin OIDC_ISSUER (P10). */
jest.setTimeout(60_000);

/**
 * Mongo 8 con réplica rs0 de un nodo (las transacciones del Outbox la necesitan): se espera el log, se inicia la
 * réplica con exec y se espera a que el nodo sea primario. GLIBC_TUNABLES=glibc.pthread.rseq=0: con kernel 6.19 o
 * más nuevo (el runner de GitHub) MongoDB 8.0 no arranca si glibc registra rseq (SERVER-121912); es lo que pide mongod.
 */
async function iniciarMongoRs0(): Promise<StartedTestContainer> {
  const c = await new GenericContainer('mongo:8.0.34')
    .withCommand(['--replSet', 'rs0', '--bind_ip_all'])
    .withEnvironment({ GLIBC_TUNABLES: 'glibc.pthread.rseq=0' })
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .withStartupTimeout(120_000)
    .withLogConsumer((salida) => {
      if (process.env.CI) salida.on('data', (l) => process.stdout.write(`[mongo] ${String(l)}`));
    })
    .start();
  const sh = (js: string) => c.exec(['mongosh', '--quiet', '--eval', js]);
  const inicio = await sh("rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]}).ok");
  if (inicio.exitCode !== 0) throw new Error(`rs.initiate falló: ${inicio.output}`);
  for (let i = 0; i < 120; i++) {
    if ((await sh('db.hello().isWritablePrimary')).output.trim() === 'true') return c;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('la réplica rs0 no llegó a primaria en 60 s');
}

describe('Flota (Mongo rs0 + RabbitMQ)', () => {
  let mongo: StartedTestContainer;
  let rabbit: StartedRabbitMQContainer;
  let api: INestApplication;
  let worker: INestApplication;

  beforeAll(async () => {
    [mongo, rabbit] = await Promise.all([iniciarMongoRs0(), new RabbitMQContainer('rabbitmq:4.4.0-management').start()]);
    process.env.MONGO_URI = `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/flota?directConnection=true`;
    process.env.AMQP_URL = rabbit.getAmqpUrl();
    process.env.OIDC_ISSUER = '';
    process.env.OUTBOX_INTERVALO_MS = '200';
    const { AppModule } = await import('../../src/app.module');
    const { WorkerModule } = await import('../../src/worker.module');
    api = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    await api.init();
    worker = (await Test.createTestingModule({ imports: [WorkerModule] }).compile()).createNestApplication();
    await worker.init();
  }, 180_000);

  afterAll(async () => {
    await worker?.close();
    await api?.close();
    await Promise.all([mongo?.stop(), rabbit?.stop()]);
  }, 60_000);

  it('salud no depende de Keycloak', async () => {
    await request(api.getHttpServer()).get('/health').expect(200, { estado: 'UP' });
    const listo = await request(api.getHttpServer()).get('/health/ready').expect(200);
    expect(listo.body.dependencias).toEqual({ mongo: 'UP', rabbitmq: 'UP' });
  });

  it('sin OIDC_ISSUER el negocio responde 503 con Problem Details y la correlación', async () => {
    const correlacion = '0193a000-0000-7000-8000-00000000abcd';
    const r = await request(api.getHttpServer()).get('/api/v1/unidades').set('X-Correlation-Id', correlacion).expect(503);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.headers['retry-after']).toBe('30');
    expect(r.headers['x-correlation-id']).toBe(correlacion);
    expect(r.body).toMatchObject({ codigo: 'DEPENDENCIA_NO_DISPONIBLE', correlationId: correlacion, status: 503 });
  });

  it('el Outbox solo se escribe dentro de una transacción', async () => {
    const registro = worker.get<RegistroDeEventos>(REGISTRO_DE_EVENTOS);
    await expect(registro.registrar('ChoferActualizado', 'flota.chofer-actualizado.v1', {})).rejects.toThrow('UnidadDeTrabajo');
  });

  it('una transacción que falla no deja el evento', async () => {
    const uow = worker.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO);
    const registro = worker.get<RegistroDeEventos>(REGISTRO_DE_EVENTOS);
    await expect(
      uow.ejecutar(async () => {
        await registro.registrar('ChoferActualizado', 'flota.chofer-actualizado.v1', { choferId: 'revertido' });
        throw new Error('falla después de registrar');
      }),
    ).rejects.toThrow('falla');
    const conexion = worker.get<Connection>(getConnectionToken());
    expect(await conexion.collection('outboxEventos').countDocuments({ 'sobre.datos.choferId': 'revertido' })).toBe(0);
  });

  it('el relay publica el sobre con confirmación y marca publicadoEn', async () => {
    const conexion = await amqp.connect(rabbit.getAmqpUrl());
    const canal = await conexion.createChannel();
    await canal.assertExchange('transporte.events', 'topic', { durable: true });
    const { queue } = await canal.assertQueue('', { exclusive: true });
    await canal.bindQueue(queue, 'transporte.events', 'flota.#');

    const uow = worker.get<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO);
    const registro = worker.get<RegistroDeEventos>(REGISTRO_DE_EVENTOS);
    await uow.ejecutar(() =>
      registro.registrar('ChoferActualizado', 'flota.chofer-actualizado.v1', { choferId: 'c1', versionAgregado: 1 }),
    );

    const mensaje = await new Promise<amqp.ConsumeMessage>((resolver, rechazar) => {
      const t = setTimeout(() => rechazar(new Error('el relay no publicó')), 10_000);
      void canal.consume(
        queue,
        (m) => {
          if (m) {
            clearTimeout(t);
            resolver(m);
          }
        },
        { noAck: true },
      );
    });
    const sobre = JSON.parse(mensaje.content.toString());
    expect(sobre).toMatchObject({ tipo: 'ChoferActualizado', version: 1, productor: 'flota', datos: { choferId: 'c1' } });
    expect(mensaje.properties.messageId).toBe(sobre.id);
    await new Promise((r) => setTimeout(r, 300));
    const mongoConexion = worker.get<Connection>(getConnectionToken());
    expect(await mongoConexion.collection('outboxEventos').countDocuments({ publicadoEn: null })).toBe(0);
    await conexion.close();
  });
});
