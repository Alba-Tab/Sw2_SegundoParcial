import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import * as amqp from 'amqplib';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { Connection } from 'mongoose';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { choferActualizado, iniciarMongoRs0 } from './contenedores';
import { REGISTRO_DE_EVENTOS, RegistroDeEventos } from '../../src/aplicacion/puertos/registro-de-eventos';
import { UNIDAD_DE_TRABAJO, UnidadDeTrabajo } from '../../src/aplicacion/puertos/unidad-de-trabajo';
import { ListarChoferesResponse, SaludListaResponse, SaludResponse } from '../../src/infraestructura/http/contrato/flota.zod';

/** Mismas versiones que plataforma/compose. Sin OIDC_ISSUER (P10). */
jest.setTimeout(60_000);

/** Espera hasta 10 s a que la condición se cumpla. */
async function esperar<T>(leer: () => Promise<T>, listo: (v: T) => boolean): Promise<T> {
  let v = await leer();
  for (let i = 0; i < 50 && !listo(v); i++) {
    await new Promise((r) => setTimeout(r, 200));
    v = await leer();
  }
  return v;
}

const DOCUMENTOS = [
  { tipo: 'SOAT', venceEl: '2030-01-01' },
  { tipo: 'INSPECCION_TECNICA', venceEl: '2030-01-01' },
];

describe('Flota (Mongo rs0 + RabbitMQ)', () => {
  let mongo: StartedTestContainer;
  let rabbit: StartedRabbitMQContainer;
  let api: INestApplication;
  let worker: INestApplication;

  /** Mensajes que quedan en una cola, sin consumirlos. */
  async function contarEn(cola: string): Promise<number> {
    const c = await amqp.connect(rabbit.getAmqpUrl());
    try {
      return (await (await c.createChannel()).checkQueue(cola)).messageCount;
    } finally {
      await c.close();
    }
  }

  beforeAll(async () => {
    [mongo, rabbit] = await Promise.all([iniciarMongoRs0(), new RabbitMQContainer('rabbitmq:4.4.0-management').start()]);
    process.env.MONGO_URI = `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/flota?directConnection=true`;
    process.env.AMQP_URL = rabbit.getAmqpUrl();
    process.env.OIDC_ISSUER = '';
    process.env.OUTBOX_INTERVALO_MS = '200';
    process.env.TEMPORAL_WORKER = 'false';
    // Las colas del consumidor como en plataforma/compose/rabbitmq/definitions.json: quorum, 5 entregas como máximo y
    // cola de fallidos por transporte.dlx; flota.sensor enlazada a amq.topic como la deja el puente MQTT.
    const admin = await amqp.connect(rabbit.getAmqpUrl());
    const canalAdmin = await admin.createChannel();
    await canalAdmin.assertExchange('transporte.dlx', 'direct', { durable: true });
    for (const cola of ['flota.eventos', 'flota.sensor']) {
      await canalAdmin.assertQueue(cola, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-delivery-limit': 5,
          'x-dead-letter-exchange': 'transporte.dlx',
          'x-dead-letter-routing-key': `${cola}.dlq`,
        },
      });
      await canalAdmin.assertQueue(`${cola}.dlq`, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
      await canalAdmin.bindQueue(`${cola}.dlq`, 'transporte.dlx', `${cola}.dlq`);
    }
    await canalAdmin.bindQueue('flota.sensor', 'amq.topic', 'camion.*.combustible');
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

  it('el Outbox tiene el índice parcial de pendientes (lo usa el relay) y el TTL de los publicados', async () => {
    const outbox = worker.get<Connection>(getConnectionToken()).collection('outboxEventos');
    const indices = await outbox.indexes();
    expect(indices.find((i) => i.name === 'pendientes')).toMatchObject({
      key: { publicadoEn: 1, creadoEn: 1 },
      partialFilterExpression: { publicadoEn: null },
    });
    expect(indices.find((i) => i.name === 'publicadosVencen')).toMatchObject({ expireAfterSeconds: 7 * 86_400 });
    const plan = JSON.stringify(
      await outbox
        .find({ publicadoEn: null, $or: [{ reclamadoHasta: null }, { reclamadoHasta: { $lt: new Date() } }] })
        .sort({ creadoEn: 1 })
        .limit(1)
        .explain(),
    );
    expect(plan).toContain('"indexName":"pendientes"');
  });

  it('consume ViajeCancelado de flota.eventos y libera la reserva; lo que no es JSON va a flota.eventos.dlq', async () => {
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
    const reserva = await esperar(
      () => conexion.collection('reservasUnidad').findOne({ servicioId }),
      (r) => r?.estado === 'LIBERADA',
    );
    expect(reserva?.estado).toBe('LIBERADA');
    expect((await conexion.collection('unidades').findOne({ _id: 'tx' as never }))?.estado).toBe('DISPONIBLE');
    expect(
      await esperar(
        () => contarEn('flota.eventos.dlq'),
        (n) => n > 0,
      ),
    ).toBe(1);
  });

  it('una lectura del sensor sin nivelPct termina en flota.sensor.dlq (spec 009)', async () => {
    const c = await amqp.connect(rabbit.getAmqpUrl());
    const canal = await c.createConfirmChannel();
    // Como el puente MQTT: amq.topic con la clave camion.{placa}.combustible.
    canal.publish('amq.topic', 'camion.4521KTR.combustible', Buffer.from(JSON.stringify({ placa: '4521KTR', velocidadKmh: 0 })));
    await canal.waitForConfirms();
    await c.close();
    expect(
      await esperar(
        () => contarEn('flota.sensor.dlq'),
        (n) => n > 0,
      ),
    ).toBe(1);
  });

  it('el consumidor propaga el correlationId y el traceparent del evento a los eventos que publica', async () => {
    const conexion = worker.get<Connection>(getConnectionToken());
    const [servicioId, tractoId, remolqueId, choferId] = [
      '0193a000-0000-7000-8000-0000000c0e01',
      '0193a000-0000-7000-8000-0000000c0e02',
      '0193a000-0000-7000-8000-0000000c0e03',
      '0193a000-0000-7000-8000-0000000c0e04',
    ];
    await conexion.collection('unidades').insertMany([
      {
        _id: tractoId as never,
        tipoUnidad: 'TRACTO',
        placa: '7001TRA',
        estado: 'EN_VIAJE',
        kilometraje: 1000,
        kmDesdeUltimoMantenimiento: 9950,
        documentos: DOCUMENTOS,
        atributos: { capacidadTanqueLitros: 600 },
      },
      {
        _id: remolqueId as never,
        tipoUnidad: 'REMOLQUE',
        placa: '7002FUR',
        tipoRemolque: 'FURGON',
        capacidadToneladas: 30,
        estado: 'EN_VIAJE',
        kmDesdeUltimoMantenimiento: 0,
        documentos: DOCUMENTOS,
        atributos: { volumenM3: 80 },
      },
    ]);
    await conexion.collection('reservasUnidad').insertOne({
      _id: '0193a000-0000-7000-8000-0000000c0e05' as never,
      servicioId,
      tractoId,
      remolqueId,
      choferId,
      estado: 'CONFIRMADA',
      creadaEn: new Date(),
    });
    const correlationId = '0193a000-0000-7000-8000-0000000c0e06';
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const c = await amqp.connect(rabbit.getAmqpUrl());
    const canal = await c.createConfirmChannel();
    const sobre = {
      id: '0193a000-0000-7000-8000-0000000c0e07',
      tipo: 'EntregaConfirmada',
      correlationId,
      traceparent,
      datos: { servicioId, tractoId, remolqueId, choferId, kmRecorridos: 120 },
    };
    canal.sendToQueue('flota.eventos', Buffer.from(JSON.stringify(sobre)));
    await canal.waitForConfirms();
    await c.close();
    const evento = await esperar(
      () => conexion.collection('outboxEventos').findOne({ tipo: 'MantenimientoRequerido', 'sobre.datos.placa': '7001TRA' }),
      (e) => !!e,
    );
    expect(evento?.sobre).toMatchObject({ correlationId, traceparent });
  });

  describe('API con token (llaves de un Keycloak de prueba)', () => {
    let jwks: Server;
    let apiConToken: INestApplication;
    let firmar: (sub: string, roles: string[]) => Promise<string>;

    beforeAll(async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256');
      const llave = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
      jwks = createServer((_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ keys: [llave] }));
      });
      await new Promise<void>((r) => jwks.listen(0, '127.0.0.1', () => r()));
      const issuer = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/realms/transporte`;
      firmar = (sub, roles) =>
        new SignJWT({ realm_access: { roles } })
          .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
          .setIssuer(issuer)
          .setAudience('flota')
          .setSubject(sub)
          .setExpirationTime('10m')
          .sign(privateKey);
      // El middleware lee OIDC_ISSUER al crearse: solo esta API valida contra el Keycloak de prueba.
      process.env.OIDC_ISSUER = issuer;
      const { AppModule } = await import('../../src/app.module');
      apiConToken = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
      await apiConToken.init();
      process.env.OIDC_ISSUER = '';
    });

    afterAll(async () => {
      await apiConToken?.close();
      await new Promise((r) => jwks?.close(r));
    });

    it('la misma Idempotency-Key en otro recurso o con otro usuario es 422 IDEMPOTENCIA_CUERPO_DISTINTO (000 §4.1)', async () => {
      const conexion = worker.get<Connection>(getConnectionToken());
      const [a, b] = ['0193a000-0000-7000-8000-0000000d0001', '0193a000-0000-7000-8000-0000000d0002'];
      const plataforma = (id: string, placa: string) => ({
        _id: id as never,
        tipoUnidad: 'REMOLQUE',
        placa,
        tipoRemolque: 'PLATAFORMA',
        capacidadToneladas: 30,
        estado: 'DISPONIBLE',
        kmDesdeUltimoMantenimiento: 0,
        documentos: DOCUMENTOS,
        atributos: { largoMetros: 12 },
      });
      await conexion.collection('unidades').insertMany([plataforma(a, '8001PLA'), plataforma(b, '8002PLA')]);
      const [jefe1, jefe2] = [await firmar('jefe-1', ['jefe_flota']), await firmar('jefe-2', ['jefe_flota'])];
      const clave = '0193a000-0000-7000-8000-0000000d0003';
      const baja = (unidadId: string, token: string) =>
        request(apiConToken.getHttpServer())
          .post(`/api/v1/unidades/${unidadId}/baja`)
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', clave)
          .send({ motivo: 'Vendida' });

      const primera = await baja(a, jefe1).expect(200);
      expect(primera.body).toMatchObject({ unidadId: a, estado: 'INACTIVA' });
      expect((await baja(a, jefe1).expect(200)).body).toEqual(primera.body);
      // Misma clave y mismo cuerpo en otro recurso: antes devolvía la baja de A.
      expect((await baja(b, jefe1).expect(422)).body.codigo).toBe('IDEMPOTENCIA_CUERPO_DISTINTO');
      expect((await conexion.collection('unidades').findOne({ _id: b as never }))?.estado).toBe('DISPONIBLE');
      // Misma petición enviada por otro usuario.
      expect((await baja(a, jefe2).expect(422)).body.codigo).toBe('IDEMPOTENCIA_CUERPO_DISTINTO');
    });

    it('Idempotency-Key que no es UUID es 400 y un cuerpo de 200 KB es 413 VALIDACION', async () => {
      const jefe = await firmar('jefe-1', ['jefe_flota']);
      const sinUuid = await request(apiConToken.getHttpServer())
        .post('/api/v1/unidades/0193a000-0000-7000-8000-0000000d0001/baja')
        .set('Authorization', `Bearer ${jefe}`)
        .set('Idempotency-Key', 'abc')
        .send({ motivo: 'Vendida' })
        .expect(400);
      expect(sinUuid.body.errores).toEqual([{ campo: 'Idempotency-Key', mensaje: 'debe ser un UUID' }]);
      const grande = await request(apiConToken.getHttpServer())
        .post('/api/v1/unidades')
        .set('Authorization', `Bearer ${jefe}`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ relleno: 'x'.repeat(200 * 1024) }))
        .expect(413);
      expect(grande.headers['content-type']).toContain('application/problem+json');
      expect(grande.body).toMatchObject({ codigo: 'VALIDACION', status: 413 });
    });

    it('GET /choferes?activo=true|false filtra y no devuelve versionAgregado; otro valor es 400', async () => {
      const conexion = worker.get<Connection>(getConnectionToken());
      const chofer = (id: string, activo: boolean) => ({
        _id: id as never,
        nombre: `Chofer ${id.slice(-2)}`,
        usuarioSub: `sub-${id.slice(-2)}`,
        licenciaCategoria: 'C',
        licenciaVenceEl: '2030-01-01',
        activo,
        disponible: true,
        versionAgregado: 3,
      });
      await conexion
        .collection('choferes')
        .insertMany([chofer('0193a000-0000-7000-8000-0000000d0101', true), chofer('0193a000-0000-7000-8000-0000000d0102', false)]);
      const jefe = await firmar('jefe-1', ['jefe_flota']);
      const listar = (activo: string) =>
        request(apiConToken.getHttpServer()).get('/api/v1/choferes').query({ activo }).set('Authorization', `Bearer ${jefe}`);
      const inactivos = (await listar('false').expect(200)).body;
      expect(inactivos.items.map((c: { choferId: string }) => c.choferId)).toEqual(['0193a000-0000-7000-8000-0000000d0102']);
      expect(ListarChoferesResponse.safeParse(inactivos).success).toBe(true);
      const activos = (await listar('true').expect(200)).body;
      expect(activos.items.length).toBeGreaterThan(0);
      expect(activos.items.every((c: { activo: boolean }) => c.activo)).toBe(true);
      for (const c of [...activos.items, ...inactivos.items]) expect(c).not.toHaveProperty('versionAgregado');
      await listar('si').expect(400);
    });

    it('los eventos de una petición llevan su X-Correlation-Id y su traceparent', async () => {
      const jefe = await firmar('jefe-1', ['jefe_flota']);
      const correlationId = '0193a000-0000-7000-8000-0000000d0201';
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      await request(apiConToken.getHttpServer())
        .post('/api/v1/unidades')
        .set('Authorization', `Bearer ${jefe}`)
        .set('Idempotency-Key', '0193a000-0000-7000-8000-0000000d0202')
        .set('X-Correlation-Id', correlationId)
        .set('traceparent', traceparent)
        .send({
          tipoUnidad: 'TRACTO',
          placa: '8003TRA',
          kilometraje: 1000,
          kmDesdeUltimoMantenimiento: 10000,
          documentos: DOCUMENTOS,
          atributos: { capacidadTanqueLitros: 600 },
        })
        .expect(201);
      const evento = await worker
        .get<Connection>(getConnectionToken())
        .collection('outboxEventos')
        .findOne({ tipo: 'MantenimientoRequerido', 'sobre.datos.placa': '8003TRA' });
      expect(evento?.sobre).toMatchObject({ correlationId, traceparent });
    });
  });
});
