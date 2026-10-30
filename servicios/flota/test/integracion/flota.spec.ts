import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import * as amqp from 'amqplib';
import type { Connection } from 'mongoose';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { choferActualizado, iniciarMongoRs0 } from './contenedores';
import { REGISTRO_DE_EVENTOS, RegistroDeEventos } from '../../src/aplicacion/puertos/registro-de-eventos';
import { UNIDAD_DE_TRABAJO, UnidadDeTrabajo } from '../../src/aplicacion/puertos/unidad-de-trabajo';
import { SaludListaResponse, SaludResponse } from '../../src/infraestructura/http/contrato/flota.zod';

/** Mismas versiones que plataforma/compose. Sin OIDC_ISSUER (P10). */
jest.setTimeout(60_000);

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
    process.env.TEMPORAL_WORKER = 'false';
    // La topología real viene de plataforma/compose/rabbitmq; aquí basta la cola del consumidor.
    const admin = await amqp.connect(rabbit.getAmqpUrl());
    const canalAdmin = await admin.createChannel();
    await canalAdmin.assertQueue('flota.eventos', { durable: true });
    await canalAdmin.assertQueue('flota.sensor', { durable: true });
    await admin.close();
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
    const vivo = await request(api.getHttpServer()).get('/health').expect(200, { estado: 'UP' });
    const listo = await request(api.getHttpServer()).get('/health/ready').expect(200);
    expect(listo.body.dependencias).toEqual({ mongo: 'UP', rabbitmq: 'UP' });
    // Prueba de contrato: las respuestas reales cumplen contratos/openapi/flota.yaml.
    expect(SaludResponse.safeParse(vivo.body).success).toBe(true);
    expect(SaludListaResponse.safeParse(listo.body).success).toBe(true);
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
        await registro.registrar(
          'ChoferActualizado',
          'flota.chofer-actualizado.v1',
          choferActualizado('0193a000-0000-7000-8000-0000000c4f01'),
        );
        throw new Error('falla después de registrar');
      }),
    ).rejects.toThrow('falla');
    const conexion = worker.get<Connection>(getConnectionToken());
    expect(
      await conexion.collection('outboxEventos').countDocuments({ 'sobre.datos.choferId': '0193a000-0000-7000-8000-0000000c4f01' }),
    ).toBe(0);
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
      registro.registrar('ChoferActualizado', 'flota.chofer-actualizado.v1', choferActualizado('0193a000-0000-7000-8000-0000000c4f02')),
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
    expect(sobre).toMatchObject({
      tipo: 'ChoferActualizado',
      version: 1,
      productor: 'flota',
      datos: { choferId: '0193a000-0000-7000-8000-0000000c4f02' },
    });
    expect(sobre.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(mensaje.properties.messageId).toBe(sobre.id);
    await new Promise((r) => setTimeout(r, 300));
    const mongoConexion = worker.get<Connection>(getConnectionToken());
    expect(await mongoConexion.collection('outboxEventos').countDocuments({ publicadoEn: null })).toBe(0);
    await conexion.close();
  });

  it('consume ViajeCancelado de flota.eventos y libera la reserva', async () => {
    const conexion = worker.get<Connection>(getConnectionToken());
    const servicioId = '0193a000-0000-7000-8000-00000000c0de';
    await conexion.collection('unidades').insertOne({ _id: 'tx' as never, tipoUnidad: 'TRACTO', placa: '9999ZZZ', estado: 'RESERVADA' });
    await conexion.collection('reservasUnidad').insertOne({
      _id: 'r-c0de' as never,
      servicioId,
      tractoId: 'tx',
      estado: 'CONFIRMADA',
      creadaEn: new Date(),
    });
    const c = await amqp.connect(rabbit.getAmqpUrl());
    // Con confirmación: cerrar la conexión justo después de un sendToQueue sin confirmar puede perder el mensaje.
    const canal = await c.createConfirmChannel();
    const sobre = { id: '0193a000-0000-7000-8000-0000000e0001', tipo: 'ViajeCancelado', datos: { servicioId, origen: 'USUARIO' } };
    canal.sendToQueue('flota.eventos', Buffer.from(JSON.stringify(sobre)));
    canal.sendToQueue('flota.eventos', Buffer.from('no es json'));
    await canal.waitForConfirms();
    await c.close();
    for (let i = 0; i < 50; i++) {
      if ((await conexion.collection('reservasUnidad').findOne({ servicioId }))?.estado === 'LIBERADA') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect((await conexion.collection('reservasUnidad').findOne({ servicioId }))?.estado).toBe('LIBERADA');
    expect((await conexion.collection('unidades').findOne({ _id: 'tx' as never }))?.estado).toBe('DISPONIBLE');
  });
});
