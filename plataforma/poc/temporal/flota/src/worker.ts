// PoC-2: worker de la cola `flota` (actividades Flota.*). Valida cada entrada que llega de Java contra el
// esquema del contrato y devuelve el ejemplo del contrato como resultado (S15). Reservas en memoria, idempotentes por servicioId.
import { readFileSync } from 'node:fs';
import { ApplicationFailure } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const contrato = JSON.parse(readFileSync('/contratos/programar-viaje.schema.json', 'utf8'));
const tipos = JSON.parse(readFileSync('/contratos/tipos.schema.json', 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema(tipos).addSchema(contrato);
const ID = contrato.$id;

function validar(def: string, entrada: unknown): void {
  const v = ajv.getSchema(`${ID}#/$defs/${def}`)!;
  if (!v(entrada)) {
    throw ApplicationFailure.create({
      type: 'VALIDACION', nonRetryable: true, message: `${def} no cumple el contrato`,
      details: [{ codigo: 'VALIDACION', mensaje: ajv.errorsText(v.errors), datos: { entrada } }],
    });
  }
}
const ejemplo = (def: string) => structuredClone(contrato.$defs[def].examples[0]);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), 'ACTIVIDAD', ...a);

type ReservarUnidadEntrada = { servicioId: string; viajeId: string; tipoCarga: string; toneladas: number; fechaViaje: string };
const reservas = new Map<string, string>();

const actividades = {
  'Flota.reservarUnidad': async (e: ReservarUnidadEntrada) => {
    validar('ReservarUnidadEntrada', e);
    log('Flota.reservarUnidad', e.servicioId, e.tipoCarga, e.toneladas, e.fechaViaje);
    if (e.tipoCarga === 'INSUMOS_LIQUIDOS') {
      // FS4: la única cisterna de la semilla está en MANTENIMIENTO_PENDIENTE.
      throw ApplicationFailure.create({
        type: 'SIN_UNIDAD_COMPATIBLE', nonRetryable: true, message: 'Sin unidad compatible',
        details: [{ codigo: 'SIN_UNIDAD_COMPATIBLE', mensaje: 'No hay cisterna disponible para el 2026-11-03', datos: { tipoCarga: e.tipoCarga } }],
      });
    }
    const r = ejemplo('ReservarUnidadResultado');
    r.reservaUnidadId = reservas.get(e.servicioId) ?? r.reservaUnidadId.slice(0, 24) + e.servicioId.slice(24);
    reservas.set(e.servicioId, r.reservaUnidadId);
    return r;
  },
  'Flota.confirmarReserva': async (e: { reservaUnidadId: string; servicioId: string }) => {
    validar('ConfirmarReservaEntrada', e);
    log('Flota.confirmarReserva', e.servicioId, e.reservaUnidadId);
  },
  'Flota.liberarReserva': async (e: { servicioId: string; reservaUnidadId?: string }) => {
    validar('LiberarReservaEntrada', e);
    reservas.delete(e.servicioId);
    log('Flota.liberarReserva', e.servicioId);
  },
};

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const worker = await Worker.create({ connection, namespace: 'transporte', taskQueue: 'flota', activities: actividades });
console.log(`worker flota conectado (Node ${process.version}, SDK TS)`);
await worker.run();
