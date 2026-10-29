import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ApplicationFailure } from '@temporalio/common';
import type { Connection } from 'mongoose';
import type { StartedTestContainer } from 'testcontainers';
import { uuid7 } from '../../src/dominio/comun/uuid7';
import { ActividadesFlota } from '../../src/infraestructura/temporal/actividades-flota';
import { CHOFERES, RESERVAS, UNIDADES } from '../../src/infraestructura/persistencia/colecciones-flota';
import { iniciarMongoRs0 } from './contenedores';

/** Actividades Flota.* (spec 003, paso 3, 5 y compensación) contra Mongo rs0, como las llama el worker de Temporal. */
jest.setTimeout(60_000);

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
    process.env.OIDC_ISSUER = '';
    const { WorkerModule } = await import('../../src/worker.module');
    const app = (await Test.createTestingModule({ imports: [WorkerModule] }).compile()).createNestApplication();
    await app.init();
    conexion = app.get<Connection>(getConnectionToken());
    flota = app.get(ActividadesFlota).mapa();
    cerrar = () => app.close();
  }, 180_000);

  afterAll(async () => {
    await cerrar?.();
    await mongo?.stop();
  }, 60_000);

  beforeEach(async () => {
    await Promise.all([UNIDADES, CHOFERES, RESERVAS].map((c) => conexion.collection(c).deleteMany({})));
    await conexion
      .collection(UNIDADES)
      .insertMany([
        tracto('t1', '1111AAA', 5000),
        tracto('t2', '4521KTR', 8000),
        remolque('f1', '3001FUR', 'FURGON', 9950),
        remolque('f2', '3002FUR', 'FURGON', 100),
        remolque('f3', '3003FUR', 'FURGON', 99999, { documentos: docs('2026-11-01') }),
        remolque('p1', '4001PLA', 'PLATAFORMA', 300),
        remolque('c1', '5001CIS', 'CISTERNA', 12000, { estado: 'MANTENIMIENTO_PENDIENTE' }),
      ] as never[]);
    await conexion
      .collection(CHOFERES)
      .insertMany([
        chofer('ch1', 'Juan Mamani'),
        chofer('ch2', 'Pedro Quispe', { licenciaCategoria: 'B' }),
        chofer('ch3', 'Luis Choque', { licenciaVenceEl: '2026-11-01' }),
        chofer('ch4', 'Ana Flores'),
      ] as never[]);
  });

  it('toma el furgón y el tracto con más km y el primer chofer habilitado; un reintento devuelve lo mismo', async () => {
    const servicio = uuid7();
    const r = await reservar(servicio);
    expect(r).toEqual({
      reservaUnidadId: r.reservaUnidadId,
      tractoId: 't2',
      remolqueId: 'f1',
      placa: '4521KTR',
      choferId: 'ch1',
      choferNombre: 'Juan Mamani',
      choferUsuarioSub: 'sub-ch1',
    });
    expect(await reservar(servicio)).toEqual(r);
    expect([await estado('t2'), await estado('f1'), await estado('t1'), await libre('ch1')]).toEqual([
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
    expect(new Set([a.remolqueId, b.remolqueId])).toEqual(new Set(['f1', 'f2']));
    expect(new Set([a.choferId, b.choferId])).toEqual(new Set(['ch1', 'ch4']));
  });

  it('sin cisterna disponible: SIN_UNIDAD_COMPATIBLE no reintentable y no queda nada tomado', async () => {
    const f = await falla(reservar(uuid7(), 'INSUMOS_LIQUIDOS', 20));
    expect(f.type).toBe('SIN_UNIDAD_COMPATIBLE');
    expect(f.nonRetryable).toBe(true);
    expect(f.details?.[0]).toMatchObject({ codigo: 'SIN_UNIDAD_COMPATIBLE', datos: { tipoCarga: 'INSUMOS_LIQUIDOS' } });

    await conexion.collection(CHOFERES).updateMany({}, { $set: { disponible: false } });
    expect((await falla(reservar(uuid7()))).message).toContain('chofer');
    expect([await estado('f1'), await estado('t2')]).toEqual(['DISPONIBLE', 'DISPONIBLE']);
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
    expect([await estado('t2'), await estado('f1'), await libre('ch1')]).toEqual(['DISPONIBLE', 'DISPONIBLE', true]);
  });

  it('liberar antes que reservar deja una lápida y la reserva tardía ya no toma unidades', async () => {
    const servicio = uuid7();
    await flota['Flota.liberarReserva']({ servicioId: servicio });
    const f = await falla(reservar(servicio));
    expect(f.type).toBe('CONFLICTO_ESTADO');
    expect(await estado('f1')).toBe('DISPONIBLE');
  });
});
