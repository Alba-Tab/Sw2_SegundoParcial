import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ApplicationFailure } from '@temporalio/common';
import type { Connection } from 'mongoose';
import type { StartedTestContainer } from 'testcontainers';
import { uuid7 } from '../../src/dominio/comun/uuid7';
import { ActividadesFlota } from '../../src/infraestructura/temporal/actividades-flota';
import { CHOFERES, RESERVAS, UNIDADES } from '../../src/infraestructura/persistencia/colecciones-flota';
import { LiberarPorCancelacion } from '../../src/aplicacion/reserva/liberar-por-cancelacion';
import { LiberarPorEntrega } from '../../src/aplicacion/reserva/liberar-por-entrega';
import { PonerEnViaje } from '../../src/aplicacion/reserva/poner-en-viaje';
import { ActualizarChofer } from '../../src/aplicacion/chofer/actualizar-chofer';
import { ProcesarLectura } from '../../src/aplicacion/combustible/procesar-lectura';
import { RegistrarCarga } from '../../src/aplicacion/combustible/registrar-carga';
import { COMBUSTIBLE_REPOSITORIO } from '../../src/aplicacion/puertos/combustible-repositorio';
import { RELOJ } from '../../src/aplicacion/puertos/reloj';
import { RESERVA_UNIDAD_REPOSITORIO } from '../../src/aplicacion/puertos/reserva-unidad-repositorio';
import { UNIDAD_REPOSITORIO } from '../../src/aplicacion/puertos/unidad-repositorio';
import { CARGAS, DETECCIONES, LECTURAS } from '../../src/infraestructura/persistencia/combustible-mongo';
import { CHOFER_REPOSITORIO } from '../../src/aplicacion/puertos/chofer-repositorio';
import { REGISTRO_DE_EVENTOS } from '../../src/aplicacion/puertos/registro-de-eventos';
import { UNIDAD_DE_TRABAJO } from '../../src/aplicacion/puertos/unidad-de-trabajo';
import { INBOX_EVENTOS } from '../../src/infraestructura/persistencia/inbox-mongo';
import { cargarSemilla, diaDesdeHoy } from '../../src/infraestructura/persistencia/semilla-mongo';
import { iniciarMongoRs0 } from './contenedores';

/** Actividades Flota.* (spec 003, paso 3, 5 y compensación) contra Mongo rs0, como las llama el worker de Temporal. */
jest.setTimeout(60_000);

/** Ids de prueba (UUID: el Outbox valida los eventos contra su contrato). */
const ID = {
  t1: '01933c00-0000-7000-8000-000000000a01',
  t2: '01933c00-0000-7000-8000-000000000a02',
  f1: '01933c00-0000-7000-8000-000000000a03',
  f2: '01933c00-0000-7000-8000-000000000a04',
  f3: '01933c00-0000-7000-8000-000000000a05',
  p1: '01933c00-0000-7000-8000-000000000a06',
  c1: '01933c00-0000-7000-8000-000000000a07',
  ch1: '01933c00-0000-7000-8000-000000000a08',
  ch2: '01933c00-0000-7000-8000-000000000a09',
  ch3: '01933c00-0000-7000-8000-000000000a0a',
  ch4: '01933c00-0000-7000-8000-000000000a0b',
};

const docs = (venceEl = '2027-03-01') => [
  { tipo: 'SOAT', venceEl },
  { tipo: 'INSPECCION_TECNICA', venceEl },
];
const tracto = (id: string, placa: string, km: number) => ({
  _id: id,
  tipoUnidad: 'TRACTO',
  placa,
  estado: 'DISPONIBLE',
  kilometraje: 184000,
  kmDesdeUltimoMantenimiento: km,
  documentos: docs(),
  atributos: { capacidadTanqueLitros: 600 },
});
const remolque = (id: string, placa: string, tipoRemolque: string, km: number, extra: object = {}) => ({
  _id: id,
  tipoUnidad: 'REMOLQUE',
  placa,
  tipoRemolque,
  capacidadToneladas: 30,
  estado: 'DISPONIBLE',
  kmDesdeUltimoMantenimiento: km,
  documentos: docs(),
  atributos: {},
  ...extra,
});
const chofer = (id: string, nombre: string, extra: object = {}) => ({
  _id: id,
  nombre,
  usuarioSub: `sub-${id}`,
  licenciaCategoria: 'C',
  licenciaVenceEl: '2028-01-01',
  activo: true,
  disponible: true,
  ...extra,
});

describe('Reservas de la saga (Mongo rs0)', () => {
  let mongo: StartedTestContainer;
  let conexion: Connection;
  let cerrar: () => Promise<void>;
  let flota: ReturnType<ActividadesFlota['mapa']>;
  let cancelaciones: LiberarPorCancelacion;
  let enViaje: PonerEnViaje;
  let finDeViaje: LiberarPorEntrega;
  let actualizarChofer: ActualizarChofer;
  let registrarCarga: RegistrarCarga;
  let lecturas: ProcesarLectura;

  const reservar = (servicioId: string, tipoCarga = 'GRANOS', toneladas = 28) =>
    flota['Flota.reservarUnidad']({ servicioId, viajeId: uuid7(), tipoCarga: tipoCarga as never, toneladas, fechaViaje: '2026-11-10' });
  const estado = async (id: string) => (await conexion.collection(UNIDADES).findOne({ _id: id as never }))?.estado;
  const libre = async (id: string) => (await conexion.collection(CHOFERES).findOne({ _id: id as never }))?.disponible;
  const falla = async (p: Promise<unknown>): Promise<ApplicationFailure> => {
    try {
      await p;
    } catch (e) {
      if (e instanceof ApplicationFailure) return e;
      throw e;
    }
    throw new Error('la actividad no falló');
  };

  beforeAll(async () => {
    mongo = await iniciarMongoRs0();
    process.env.MONGO_URI = `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/flota?directConnection=true`;
    process.env.TEMPORAL_WORKER = 'false';
    process.env.CONSUMIR_EVENTOS = 'false';
    process.env.OIDC_ISSUER = '';
    const { WorkerModule } = await import('../../src/worker.module');
    const app = (await Test.createTestingModule({ imports: [WorkerModule] }).compile()).createNestApplication();
    await app.init();
    conexion = app.get<Connection>(getConnectionToken());
    flota = app.get(ActividadesFlota).mapa();
    cancelaciones = app.get(LiberarPorCancelacion);
    enViaje = app.get(PonerEnViaje);
    finDeViaje = app.get(LiberarPorEntrega);
    actualizarChofer = new ActualizarChofer(app.get(UNIDAD_DE_TRABAJO), app.get(CHOFER_REPOSITORIO), app.get(REGISTRO_DE_EVENTOS));
    registrarCarga = new RegistrarCarga(
      app.get(UNIDAD_DE_TRABAJO),
      app.get(COMBUSTIBLE_REPOSITORIO),
      app.get(RESERVA_UNIDAD_REPOSITORIO),
      app.get(UNIDAD_REPOSITORIO),
      app.get(CHOFER_REPOSITORIO),
      app.get(REGISTRO_DE_EVENTOS),
      app.get(RELOJ),
    );
    lecturas = app.get(ProcesarLectura);
    cerrar = () => app.close();
  }, 180_000);

  afterAll(async () => {
    await cerrar?.();
    await mongo?.stop();
  }, 60_000);

  beforeEach(async () => {
    await Promise.all(
      [UNIDADES, CHOFERES, RESERVAS, INBOX_EVENTOS, 'outboxEventos', CARGAS, LECTURAS, DETECCIONES].map((c) =>
        conexion.collection(c).deleteMany({}),
      ),
    );
    await conexion
      .collection(UNIDADES)
      .insertMany([
        tracto(ID.t1, '1111AAA', 5000),
        tracto(ID.t2, '4521KTR', 8000),
        remolque(ID.f1, '3001FUR', 'FURGON', 9950),
        remolque(ID.f2, '3002FUR', 'FURGON', 100),
        remolque(ID.f3, '3003FUR', 'FURGON', 99999, { documentos: docs('2026-11-01') }),
        remolque(ID.p1, '4001PLA', 'PLATAFORMA', 300),
        remolque(ID.c1, '5001CIS', 'CISTERNA', 12000, { estado: 'MANTENIMIENTO_PENDIENTE' }),
      ] as never[]);
    await conexion
      .collection(CHOFERES)
      .insertMany([
        chofer(ID.ch1, 'Juan Mamani'),
        chofer(ID.ch2, 'Pedro Quispe', { licenciaCategoria: 'B' }),
        chofer(ID.ch3, 'Luis Choque', { licenciaVenceEl: '2026-11-01' }),
        chofer(ID.ch4, 'Ana Flores'),
      ] as never[]);
  });

  it('toma el furgón y el tracto con más km y el primer chofer habilitado; un reintento devuelve lo mismo', async () => {
    const servicio = uuid7();
    const r = await reservar(servicio);
    expect(r).toEqual({
      reservaUnidadId: r.reservaUnidadId,
      tractoId: ID.t2,
      remolqueId: ID.f1,
      placa: '4521KTR',
      choferId: ID.ch1,
      choferNombre: 'Juan Mamani',
      choferUsuarioSub: `sub-${ID.ch1}`,
    });
    expect(await reservar(servicio)).toEqual(r);
    expect([await estado(ID.t2), await estado(ID.f1), await estado(ID.t1), await libre(ID.ch1)]).toEqual([
      'RESERVADA',
      'RESERVADA',
      'DISPONIBLE',
      false,
    ]);
    expect(await conexion.collection(RESERVAS).countDocuments()).toBe(1);
  });

  it('dos sagas a la vez nunca toman la misma unidad ni el mismo chofer', async () => {
    const [a, b] = await Promise.all([reservar(uuid7()), reservar(uuid7())]);
    expect(new Set([a.tractoId, b.tractoId]).size).toBe(2);
    expect(new Set([a.remolqueId, b.remolqueId])).toEqual(new Set([ID.f1, ID.f2]));
    expect(new Set([a.choferId, b.choferId])).toEqual(new Set([ID.ch1, ID.ch4]));
  });

  it('sin cisterna disponible: SIN_UNIDAD_COMPATIBLE no reintentable y no queda nada tomado', async () => {
    const f = await falla(reservar(uuid7(), 'INSUMOS_LIQUIDOS', 20));
    expect(f.type).toBe('SIN_UNIDAD_COMPATIBLE');
    expect(f.nonRetryable).toBe(true);
    expect(f.details?.[0]).toMatchObject({ codigo: 'SIN_UNIDAD_COMPATIBLE', datos: { tipoCarga: 'INSUMOS_LIQUIDOS' } });

    await conexion.collection(CHOFERES).updateMany({}, { $set: { disponible: false } });
    expect((await falla(reservar(uuid7()))).message).toContain('chofer');
    expect([await estado(ID.f1), await estado(ID.t2)]).toEqual(['DISPONIBLE', 'DISPONIBLE']);
  });

  it('confirmar y liberar son idempotentes; liberar devuelve unidades y chofer', async () => {
    const servicio = uuid7();
    const r = await reservar(servicio);
    await flota['Flota.confirmarReserva']({ reservaUnidadId: r.reservaUnidadId, servicioId: servicio });
    await flota['Flota.confirmarReserva']({ reservaUnidadId: r.reservaUnidadId, servicioId: servicio });
    expect((await conexion.collection(RESERVAS).findOne({ servicioId: servicio }))?.estado).toBe('CONFIRMADA');

    await flota['Flota.liberarReserva']({ servicioId: servicio, reservaUnidadId: r.reservaUnidadId });
    await flota['Flota.liberarReserva']({ servicioId: servicio });
    expect((await conexion.collection(RESERVAS).findOne({ servicioId: servicio }))?.estado).toBe('LIBERADA');
    expect([await estado(ID.t2), await estado(ID.f1), await libre(ID.ch1)]).toEqual(['DISPONIBLE', 'DISPONIBLE', true]);
  });

  it('liberar antes que reservar deja una lápida y la reserva tardía ya no toma unidades', async () => {
    const servicio = uuid7();
    await flota['Flota.liberarReserva']({ servicioId: servicio });
    const f = await falla(reservar(servicio));
    expect(f.type).toBe('CONFLICTO_ESTADO');
    expect(await estado(ID.f1)).toBe('DISPONIBLE');
  });

  it('ViajeCancelado libera unidades y chofer una sola vez (spec 004)', async () => {
    const servicio = uuid7();
    await reservar(servicio);
    const sobre = { id: uuid7(), tipo: 'ViajeCancelado' as const, datos: { servicioId: servicio, origen: 'USUARIO' as const } };
    expect(await cancelaciones.ejecutar(sobre)).toBe(true);
    expect(await cancelaciones.ejecutar(sobre)).toBe(false);
    expect([await estado(ID.t2), await estado(ID.f1), await libre(ID.ch1)]).toEqual(['DISPONIBLE', 'DISPONIBLE', true]);
    expect((await conexion.collection(RESERVAS).findOne({ servicioId: servicio }))?.estado).toBe('LIBERADA');
  });

  it('la semilla deja 5 tractos, 6 remolques y 4 choferes, y la reserva del Aula toma 4521KTR, el furgón de 9.950 km y a chofer1', async () => {
    await Promise.all([UNIDADES, CHOFERES].map((c) => conexion.collection(c).deleteMany({})));
    await cargarSemilla(conexion, '../../plataforma/semilla');
    expect(await cargarSemilla(conexion, '../../plataforma/semilla')).toEqual({ unidades: 11, choferes: 4 });
    expect(await conexion.collection(UNIDADES).countDocuments({ tipoUnidad: 'TRACTO' })).toBe(5);
    expect((await conexion.collection(CHOFERES).findOne({ usuarioSub: '0193a000-0000-7000-8000-000000000011' }))?.licenciaVenceEl).toBe(
      diaDesdeHoy(400),
    );
    const r = await flota['Flota.reservarUnidad']({
      servicioId: uuid7(),
      viajeId: uuid7(),
      tipoCarga: 'GRANOS',
      toneladas: 28,
      fechaViaje: diaDesdeHoy(0),
    });
    expect(r).toMatchObject({ placa: '4521KTR', remolqueId: '01933c00-0000-7000-8000-000000000011', choferNombre: 'Marco Quispe' });
    const f = await falla(
      flota['Flota.reservarUnidad']({
        servicioId: uuid7(),
        viajeId: uuid7(),
        tipoCarga: 'INSUMOS_LIQUIDOS',
        toneladas: 20,
        fechaViaje: diaDesdeHoy(0),
      }),
    );
    expect(f.type).toBe('SIN_UNIDAD_COMPATIBLE');
  });

  it('ViajeIniciado pone tracto y remolque EN_VIAJE; la entrega suma km, libera y pide mantenimiento (FF3)', async () => {
    const servicio = uuid7();
    const r = await reservar(servicio);
    await flota['Flota.confirmarReserva']({ reservaUnidadId: r.reservaUnidadId, servicioId: servicio });
    const datos = { servicioId: servicio, tractoId: r.tractoId, remolqueId: r.remolqueId };
    expect(await enViaje.ejecutar({ id: uuid7(), tipo: 'ViajeIniciado', datos })).toBe(true);
    expect([await estado(ID.t2), await estado(ID.f1)]).toEqual(['EN_VIAJE', 'EN_VIAJE']);

    const fin = { id: uuid7(), tipo: 'EntregaConfirmada' as const, datos: { ...datos, choferId: r.choferId, kmRecorridos: 120 } };
    expect(await finDeViaje.ejecutar(fin)).toBe(true);
    expect(await finDeViaje.ejecutar(fin)).toBe(false);
    const furgon = await conexion.collection(UNIDADES).findOne({ _id: ID.f1 as never });
    expect(furgon).toMatchObject({ estado: 'MANTENIMIENTO_PENDIENTE', kmDesdeUltimoMantenimiento: 10070 });
    expect(await conexion.collection(UNIDADES).findOne({ _id: ID.t2 as never })).toMatchObject({
      estado: 'DISPONIBLE',
      kmDesdeUltimoMantenimiento: 8120,
    });
    expect([await libre(ID.ch1), (await conexion.collection(RESERVAS).findOne({ servicioId: servicio }))?.estado]).toEqual([
      true,
      'LIBERADA',
    ]);
    const eventos = await conexion.collection('outboxEventos').find({ tipo: 'MantenimientoRequerido' }).toArray();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].sobre.datos).toMatchObject({ unidadId: ID.f1, placa: '3001FUR', motivos: ['KILOMETRAJE'], kmDesdeUltimo: 10070 });

    // Un ViajeIniciado tardío (la reserva ya está LIBERADA) se ignora.
    await enViaje.ejecutar({ id: uuid7(), tipo: 'ViajeIniciado', datos });
    expect(await estado(ID.t2)).toBe('DISPONIBLE');
  });

  it('choferes:actualizar guarda el cambio, sube la versión y deja ChoferActualizado', async () => {
    expect(await actualizarChofer.ejecutar(ID.ch3, { licenciaVenceEl: '2028-06-30' })).toBe(2);
    expect((await conexion.collection(CHOFERES).findOne({ _id: ID.ch3 as never }))?.licenciaVenceEl).toBe('2028-06-30');
    const e = await conexion.collection('outboxEventos').findOne({ tipo: 'ChoferActualizado' });
    expect(e?.sobre).toMatchObject({ productor: 'flota', datos: { choferId: ID.ch3, versionAgregado: 2, licenciaVenceEl: '2028-06-30' } });
  });

  it('la carga actualiza el odómetro, publica el evento y es idempotente por opId (spec 009)', async () => {
    const servicio = uuid7();
    const viajeId = uuid7();
    const r = await flota['Flota.reservarUnidad']({
      servicioId: servicio,
      viajeId,
      tipoCarga: 'GRANOS',
      toneladas: 28,
      fechaViaje: '2026-11-10',
    });
    const chofer1 = { sub: `sub-${ID.ch1}`, roles: ['chofer'] };
    const opId = uuid7();
    const cuerpo = {
      opId,
      viajeId,
      litros: 180.5,
      monto: { monto: '675.07', moneda: 'BOB' },
      kilometraje: 184320,
      registradaEn: new Date().toISOString(),
    };
    const c = await registrarCarga.ejecutar(chofer1, opId, cuerpo, 'h1');
    expect(c).toMatchObject({ tractoId: r.tractoId, placa: '4521KTR', choferId: ID.ch1, litros: 180.5 });
    expect(await registrarCarga.ejecutar(chofer1, opId, cuerpo, 'h1')).toEqual(c);
    expect(await conexion.collection(CARGAS).countDocuments()).toBe(1);
    expect((await conexion.collection(UNIDADES).findOne({ _id: ID.t2 as never }))?.kilometraje).toBe(184320);
    expect(await conexion.collection('outboxEventos').countDocuments({ tipo: 'CargaCombustibleRegistrada' })).toBe(1);

    const codigo = (p: Promise<unknown>) =>
      p.then(
        () => 'OK',
        (e: { codigo: string }) => e.codigo,
      );
    expect(await codigo(registrarCarga.ejecutar(chofer1, opId, { ...cuerpo, litros: 10 }, 'h2'))).toBe('IDEMPOTENCIA_CUERPO_DISTINTO');
    const otro = uuid7();
    expect(await codigo(registrarCarga.ejecutar(chofer1, otro, { ...cuerpo, opId: otro, kilometraje: 184100 }, 'h3'))).toBe(
      'KILOMETRAJE_INVALIDO',
    );
    expect(await codigo(registrarCarga.ejecutar(chofer1, otro, { ...cuerpo, opId: otro, litros: 650 }, 'h4'))).toBe('CARGA_EXCEDE_TANQUE');
    expect(await codigo(registrarCarga.ejecutar({ sub: 'otro', roles: ['chofer'] }, otro, { ...cuerpo, opId: otro }, 'h5'))).toBe(
      'SIN_PERMISO',
    );
    expect(await codigo(registrarCarga.ejecutar(chofer1, uuid7(), { ...cuerpo, opId: otro }, 'h6'))).toBe('VALIDACION');
  });

  it('el sensor detecta una sola caída por parada (robo) con el viaje del tracto (FF1)', async () => {
    const servicio = uuid7();
    const viajeId = uuid7();
    const r = await flota['Flota.reservarUnidad']({
      servicioId: servicio,
      viajeId,
      tipoCarga: 'GRANOS',
      toneladas: 28,
      fechaViaje: '2026-11-10',
    });
    await enViaje.ejecutar({
      id: uuid7(),
      tipo: 'ViajeIniciado',
      datos: { servicioId: servicio, tractoId: r.tractoId, remolqueId: r.remolqueId },
    });
    const t0 = Date.now() - 120_000;
    const lectura = (seg: number, nivelPct: number, velocidadKmh = 0) => ({
      placa: '4521KTR',
      nivelPct,
      velocidadKmh,
      medidoEn: new Date(t0 + seg * 1000).toISOString(),
    });
    const resultados = [];
    for (const [seg, nivel, vel] of [
      [0, 52, 50],
      [10, 50, 0],
      [20, 48, 0],
      [30, 46, 0],
      [40, 44, 0],
      [50, 42, 0],
      [60, 40, 0],
    ] as const) {
      resultados.push(await lecturas.ejecutar(lectura(seg, nivel, vel)));
    }
    expect(resultados).toEqual(['GUARDADA', 'GUARDADA', 'GUARDADA', 'GUARDADA', 'GUARDADA', 'CAIDA', 'GUARDADA']);
    expect(await lecturas.ejecutar(lectura(60, 40))).toBe('REPETIDA');
    expect(await lecturas.ejecutar({ ...lectura(70, 40), placa: '9999ZZZ' })).toBe('PLACA_DESCONOCIDA');
    const e = await conexion.collection('outboxEventos').findOne({ tipo: 'CaidaCombustibleDetectada' });
    expect(e?.sobre.datos).toMatchObject({
      placa: '4521KTR',
      viajeId,
      nivelAnteriorPct: 50,
      nivelActualPct: 42,
      caidaPct: 8,
      velocidadKmh: 0,
    });
    expect(await conexion.collection('outboxEventos').countDocuments({ tipo: 'CaidaCombustibleDetectada' })).toBe(1);
  });
});
