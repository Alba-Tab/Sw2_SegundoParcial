import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** SQLite del celular (spec 005): los viajes descargados, la cola de operaciones y los puntos GPS pendientes. */
export const viaje = sqliteTable('viaje', {
  viajeId: text('viaje_id').primaryKey(),
  estado: text('estado').notNull(),
  /** El viaje tal como lo describe la app (ViajeLocal sin los indicadores locales), en JSON. */
  datos: text('datos').notNull(),
  iniciadoLocal: integer('iniciado_local', { mode: 'boolean' }).notNull().default(false),
  canceladoAlSincronizar: integer('cancelado_al_sincronizar', { mode: 'boolean' }).notNull().default(false),
  actualizadoEn: text('actualizado_en').notNull(),
});

export const operacionPendiente = sqliteTable('operacion_pendiente', {
  opId: text('op_id').primaryKey(),
  viajeId: text('viaje_id').notNull(),
  tipo: text('tipo').notNull(),
  cuerpo: text('cuerpo').notNull(),
  creadaEn: text('creada_en').notNull(),
  intentos: integer('intentos').notNull().default(0),
  proximoIntentoEn: text('proximo_intento_en'),
  estado: text('estado').notNull(),
  codigoError: text('codigo_error'),
  cerradaEn: text('cerrada_en'),
});

export const puntoGps = sqliteTable(
  'punto_gps',
  {
    viajeId: text('viaje_id').notNull(),
    seq: integer('seq').notNull(),
    registradaEn: text('registrada_en').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    velocidadKmh: real('velocidad_kmh').notNull(),
    precisionMetros: real('precision_metros'),
  },
  (t) => [primaryKey({ columns: [t.viajeId, t.seq] })],
);

/** Valores sueltos: el id del dispositivo y el último seq de GPS de cada viaje. */
export const ajuste = sqliteTable('ajuste', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});
