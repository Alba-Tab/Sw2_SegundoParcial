import { beforeEach, describe, expect, it } from 'vitest';
import type { PuntoGps } from '../dominio/gps';
import type { Operacion } from '../dominio/operacion';
import type { Respuesta } from '../dominio/reintento';
import type { ViajeLocal } from '../dominio/viaje';
import type { EvidenciaLocal, Parte } from '../dominio/evidencia';
import { CasosDeUso } from './casosDeUso';
import { MotorSincronizacion } from './motorSincronizacion';
import {
  type Api,
  type ApiEvidencias,
  type Cola,
  type Evidencias,
  type PuntosGps,
  SesionVencida,
  type Subida,
  type Viajes,
} from './puertos';
import { SubidaEvidencias } from './subidaEvidencias';

class ColaEnMemoria implements Cola {
  ops: Operacion[] = [];
  todas = () => this.ops.filter((o) => o.estado === 'PENDIENTE');
  agregar = (o: Operacion) => void this.ops.push(o);
  actualizar = () => {};
  descartarViaje = (viajeId: string) => {
    for (const o of this.ops) if (o.viajeId === viajeId && o.estado === 'PENDIENTE') o.estado = 'DESCARTADA';
  };
  purgar = () => {};
}

class PuntosEnMemoria implements PuntosGps {
  p: PuntoGps[] = [];
  agregar = (x: PuntoGps) => void this.p.push(x);
  seqs = new Map<string, number>();
  siguienteSeq = (v: string) => {
    const s = this.seqs.get(v) ?? 0;
    this.seqs.set(v, s + 1);
    return s;
  };
  pendientes = (v: string, n: number) => this.p.filter((x) => x.viajeId === v).slice(0, n);
  viajes = () => [...new Set(this.p.map((x) => x.viajeId))];
  borrar = (v: string, seqs: number[]) => void (this.p = this.p.filter((x) => x.viajeId !== v || !seqs.includes(x.seq)));
  borrarHasta = (v: string, s: number) => void (this.p = this.p.filter((x) => x.viajeId !== v || x.seq > s));
  contar = () => this.p.length;
}

class ViajesEnMemoria implements Viajes {
  v = new Map<string, ViajeLocal>();
  todos = () => [...this.v.values()];
  porId = (id: string) => this.v.get(id) ?? null;
  guardarDelServidor = (vs: ViajeLocal[]) => vs.forEach((x) => this.v.set(x.viajeId, x));
  marcarIniciado = (id: string) => void (this.v.get(id)!.iniciadoLocal = true);
  marcarCanceladoAlSincronizar = (id: string) => void (this.v.get(id)!.canceladoAlSincronizar = true);
  marcarEntregaLocal = (id: string, t: 'ENTREGA' | 'RECHAZO') => void (this.v.get(id)!.entregaLocal = t);
}

/** Responde con lo que haya en la cola de respuestas de cada clave (`TIPO:opId` o `GPS`), y registra cada envío. */
class ApiFalsa implements Api {
  respuestas = new Map<string, Respuesta[]>();
  enviadas: string[] = [];
  lotes: { puntos: number[]; loteId: string }[] = [];
  estado = 'EN_RUTA';
  cursorServidor: number | null = null;
  responder(clave: string, ...r: Respuesta[]) {
    this.respuestas.set(clave, r);
  }
  private siguiente(clave: string): Respuesta {
    const cola = this.respuestas.get(clave);
    return (cola && cola.length > 1 ? cola.shift() : cola?.[0]) ?? { estado: 200 };
  }
  enviar = async (op: Operacion) => {
    this.enviadas.push(`${op.tipo}:${op.opId}`);
    return this.siguiente(`${op.tipo}:${op.opId}`);
  };
  enviarLoteGps = async (_v: string, _d: string, puntos: PuntoGps[], loteId: string) => {
    this.lotes.push({ puntos: puntos.map((p) => p.seq), loteId });
    return this.siguiente('GPS');
  };
  estadoDelViaje = async () => this.estado;
  misViajes = async () => [];
  cursor = async () => this.cursorServidor;
  registrarDispositivo = async () => ({ estado: 200 });
}

class EvidenciasEnMemoria implements Evidencias {
  e = new Map<string, EvidenciaLocal>();
  agregar = (x: EvidenciaLocal) => void this.e.set(x.evidenciaId, x);
  porId = (id: string) => this.e.get(id) ?? null;
  marcarCompleta = (id: string) => void (this.e.get(id)!.estado = 'COMPLETA');
}

/** S3 en memoria: recuerda qué partes llegaron; `cortarEn` hace fallar una subida de parte (corte de red). */
class ApiEvidenciasFalsa implements ApiEvidencias {
  enS3 = new Map<string, Parte[]>();
  completadas: { id: string; partes: Parte[] }[] = [];
  subidasDeParte: string[] = [];
  cortarEn = -1;
  abrir = async (e: EvidenciaLocal) => {
    const subidas = this.enS3.get(e.evidenciaId) ?? [];
    const total = Math.ceil(e.tamanoBytes / (5 * 1024 * 1024));
    const faltan = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !subidas.some((s) => s.numero === n));
    const subida: Subida = {
      estado: this.completadas.some((c) => c.id === e.evidenciaId) ? 'COMPLETA' : 'SUBIENDO',
      tamanoParteBytes: 5 * 1024 * 1024,
      partes: faltan.map((n) => ({ numero: n, url: `s3://${e.evidenciaId}/${n}` })),
      subidas,
    };
    return { respuesta: { estado: 200 }, subida };
  };
  subirParte = async (url: string) => {
    this.subidasDeParte.push(url);
    if (this.subidasDeParte.length === this.cortarEn) return null;
    const [, id, n] = url.match(/s3:\/\/(.+)\/(\d+)/)!;
    this.enS3.set(id, [...(this.enS3.get(id) ?? []), { numero: Number(n), etag: `etag-${n}` }]);
    return `etag-${n}`;
  };
  completar = async (e: EvidenciaLocal, partes: Parte[]) => {
    this.completadas.push({ id: e.evidenciaId, partes });
    return { estado: 200 };
  };
}

const viaje = (viajeId: string): ViajeLocal => ({
  viajeId,
  estado: 'CONFIRMADO',
  iniciadoLocal: false,
  canceladoAlSincronizar: false,
  entregaLocal: null,
  cliente: 'Agroexport',
  ruta: 'Santa Cruz – Aula',
  destino: { lat: -17.8, lng: -63.2, radioMetros: 300 },
  tipoCarga: 'GRANOS',
  toneladas: 28,
  fechaViaje: '2026-11-03',
  placa: '4521KTR',
});

describe('motor de sincronización (spec 005, CU-08)', () => {
  let cola: ColaEnMemoria, puntos: PuntosEnMemoria, viajes: ViajesEnMemoria, api: ApiFalsa;
  let ahora: Date, conRed: boolean, sesionVencida: boolean, n: number;
  let evidencias: EvidenciasEnMemoria, apiEvidencias: ApiEvidenciasFalsa;
  let motor: MotorSincronizacion, casos: CasosDeUso;

  beforeEach(() => {
    cola = new ColaEnMemoria();
    puntos = new PuntosEnMemoria();
    viajes = new ViajesEnMemoria();
    api = new ApiFalsa();
    ahora = new Date('2026-11-03T12:00:00Z');
    conRed = true;
    sesionVencida = false;
    n = 0;
    const reloj = { ahora: () => ahora };
    const ids = { nuevo: () => `id-${++n}` };
    const sesion = {
      tokenVigente: async () => {
        if (sesionVencida) throw new SesionVencida();
        return 'token';
      },
    };
    const red = { hayConexion: async () => conRed };
    const dispositivo = { id: () => 'celular', plataforma: () => 'IOS' as const };
    evidencias = new EvidenciasEnMemoria();
    apiEvidencias = new ApiEvidenciasFalsa();
    const archivos = {
      guardar: (o: string, n: string) => ({ archivo: `doc/${n}`, tamanoBytes: o.includes('grande') ? 12 * 1024 * 1024 : 2048 }),
      leer: (_a: string, d: number, h: number) => new Uint8Array(h - d),
    };
    const subida = new SubidaEvidencias(evidencias, apiEvidencias, archivos);
    motor = new MotorSincronizacion(cola, puntos, viajes, api, sesion, red, reloj, ids, dispositivo, subida, () => 0.5);
    casos = new CasosDeUso(cola, puntos, viajes, api, sesion, reloj, ids, dispositivo, evidencias, archivos);
    viajes.guardarDelServidor([viaje('v1')]);
  });

  const gps = (seq: number) =>
    puntos.agregar({ viajeId: 'v1', seq, registradaEn: ahora.toISOString(), lat: -17.7, lng: -63.1, velocidadKmh: 50, precisionMetros: 5 });

  it('FO1: sin red no envía nada; al volver, el inicio primero, luego la bitácora y el GPS, una sola vez', async () => {
    conRed = false;
    const inicio = casos.iniciarViaje('v1', null);
    gps(0);
    const hito = casos.encolar('v1', 'HITO', { tipo: 'BLOQUEO' });
    const frenada = casos.encolar('v1', 'EVENTO_CONDUCCION', { tipo: 'FRENADA_BRUSCA' });
    expect((await motor.sincronizar()).sinConexion).toBe(true);
    expect(api.enviadas).toEqual([]);
    expect(viajes.porId('v1')?.iniciadoLocal).toBe(true);

    conRed = true;
    const r = await motor.sincronizar();
    expect(api.enviadas).toEqual([`INICIO:${inicio}`, `HITO:${hito}`, `EVENTO_CONDUCCION:${frenada}`]);
    expect(r.confirmadas).toBe(3);
    expect(api.lotes.map((l) => l.puntos)).toEqual([[0]]);
    expect(puntos.contar()).toBe(0);
    await motor.sincronizar();
    expect(api.enviadas).toHaveLength(3);
  });

  it('FO2: con cortes reintenta con esperas crecientes y la misma clave hasta confirmar', async () => {
    const inicio = casos.iniciarViaje('v1', null);
    api.responder(`INICIO:${inicio}`, { estado: 'SIN_RED' }, { estado: 'SIN_RED' }, { estado: 503 }, { estado: 200 });
    const esperas: number[] = [];
    for (let i = 0; i < 3; i++) {
      await motor.sincronizar();
      const op = cola.ops[0];
      esperas.push(Date.parse(op.proximoIntentoEn!) - ahora.getTime());
      ahora = new Date(Date.parse(op.proximoIntentoEn!));
    }
    expect(esperas).toEqual([500, 1000, 2000]);
    await motor.sincronizar();
    expect(cola.ops[0].estado).toBe('CONFIRMADA');
    expect(new Set(api.enviadas)).toEqual(new Set([`INICIO:${inicio}`]));
  });

  it('el GPS no sale hasta que el inicio está confirmado y respeta Retry-After (FO4)', async () => {
    const inicio = casos.iniciarViaje('v1', null);
    for (let s = 0; s < 150; s++) gps(s);
    api.responder(`INICIO:${inicio}`, { estado: 409, codigo: 'CONFIRMACION_EN_CURSO' }, { estado: 200 });
    await motor.sincronizar();
    expect(api.lotes).toEqual([]);

    ahora = new Date(ahora.getTime() + 1000);
    api.responder('GPS', { estado: 503, reintentarEnSegundos: 10 }, { estado: 200 });
    await motor.sincronizar();
    expect(api.lotes.map((l) => l.puntos.length)).toEqual([100]);
    expect(puntos.contar()).toBe(150);

    ahora = new Date(ahora.getTime() + 5000);
    await motor.sincronizar();
    expect(api.lotes).toHaveLength(1);
    ahora = new Date(ahora.getTime() + 6000);
    await motor.sincronizar();
    expect(api.lotes.map((l) => l.puntos.length)).toEqual([100, 100, 50]);
    expect(puntos.contar()).toBe(0);
  });

  it('plan F7: el viaje se canceló mientras el inicio esperaba sin señal; se descarta su cola y se avisa', async () => {
    const inicio = casos.iniciarViaje('v1', null);
    const hito = casos.encolar('v1', 'HITO', { tipo: 'PARADA' });
    api.responder(`INICIO:${inicio}`, { estado: 409, codigo: 'CONFLICTO_ESTADO' });
    api.estado = 'CANCELADO';
    const r = await motor.sincronizar();
    expect(r.cancelados).toEqual(['v1']);
    expect(api.enviadas).toEqual([`INICIO:${inicio}`]);
    expect(cola.ops.find((o) => o.opId === hito)?.estado).toBe('DESCARTADA');
    expect(viajes.porId('v1')?.canceladoAlSincronizar).toBe(true);
  });

  it('un 4xx definitivo deja la operación FALLIDA con su código y sigue con la siguiente', async () => {
    casos.iniciarViaje('v1', null);
    const malo = casos.encolar('v1', 'HITO', { tipo: 'OTRO' });
    const bueno = casos.encolar('v1', 'HITO', { tipo: 'PARADA' });
    api.responder(`HITO:${malo}`, { estado: 422, codigo: 'IDEMPOTENCIA_CUERPO_DISTINTO' });
    await motor.sincronizar();
    expect(cola.ops.find((o) => o.opId === malo)).toMatchObject({ estado: 'FALLIDA', codigoError: 'IDEMPOTENCIA_CUERPO_DISTINTO' });
    expect(cola.ops.find((o) => o.opId === bueno)?.estado).toBe('CONFIRMADA');
  });

  it('con la sesión vencida pide iniciar sesión sin borrar la cola', async () => {
    casos.iniciarViaje('v1', null);
    sesionVencida = true;
    expect((await motor.sincronizar()).requiereSesion).toBe(true);
    expect(cola.todas()).toHaveLength(1);
  });

  it('al abrir, borra los puntos que el servidor ya aceptó según el cursor del celular', async () => {
    for (let s = 0; s < 10; s++) gps(s);
    api.cursorServidor = 6;
    await motor.recuperarCursor();
    expect(puntos.pendientes('v1', 100).map((p) => p.seq)).toEqual([7, 8, 9]);
  });

  it('dos disparadores a la vez comparten la misma tanda', async () => {
    casos.iniciarViaje('v1', null);
    await Promise.all([motor.sincronizar(), motor.sincronizar()]);
    expect(api.enviadas).toHaveLength(1);
  });

  it('T7.3: las lecturas pasan por el muestreo con seq creciente y la frenada sale con la última posición', async () => {
    const t0 = ahora.getTime();
    const lectura = (en: number, lat: number) => ({ lat, lng: -63.18, velocidadMs: 16.7, precisionMetros: 5, en: t0 + en });
    expect(casos.registrarFrenada('v1', 0.5)).toBeNull();
    expect([0, 5000, 21_000, 22_000].map((t, i) => casos.registrarLectura('v1', lectura(t, -17.7 - i * 0.00001)))).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(puntos.p.map((p) => p.seq)).toEqual([0, 1]);
    expect(puntos.p[0].velocidadKmh).toBe(60.1);
    const op = casos.registrarFrenada('v1', 0.55)!;
    const frenada = cola.ops.find((o) => o.opId === op)!;
    expect(frenada.cuerpo).toMatchObject({ tipo: 'FRENADA_BRUSCA', magnitudG: 0.55, posicion: { lng: -63.18 } });
    expect((frenada.cuerpo.posicion as { lat: number }).lat).toBeCloseTo(-17.70003, 8);
  });

  it('T7.7: la alerta de fatiga va a la cola como evento de conducción, sin magnitud', () => {
    expect(casos.registrarFatiga('v1')).toBeNull();
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 20, precisionMetros: 5, en: ahora.getTime() });
    const op = casos.registrarFatiga('v1')!;
    const fatiga = cola.ops.find((o) => o.opId === op)!;
    expect(fatiga.tipo).toBe('EVENTO_CONDUCCION');
    expect(fatiga.cuerpo).toMatchObject({ tipo: 'ALERTA_FATIGA', posicion: { lat: -17.7, lng: -63.18 } });
    expect(fatiga.cuerpo).not.toHaveProperty('magnitudG');
  });

  it('T7.4: el hito va a la cola con el texto revisado y la posición; sin GPS o con texto corto, no', () => {
    expect(() => casos.registrarHito('v1', 'BLOQUEO', 'Bloqueo en el puente', 'VOZ')).toThrow(/GPS/);
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 0, precisionMetros: 5, en: ahora.getTime() });
    expect(() => casos.registrarHito('v1', 'BLOQUEO', ' ab ', 'TEXTO')).toThrow(/3 a 500/);
    const op = casos.registrarHito('v1', 'BLOQUEO', '  Bloqueo en el puente  ', 'VOZ');
    expect(cola.ops.find((o) => o.opId === op)?.cuerpo).toMatchObject({
      tipo: 'BLOQUEO',
      descripcion: 'Bloqueo en el puente',
      origen: 'VOZ',
      posicion: { lat: -17.7, lng: -63.18 },
    });
  });

  it('T7.5: la entrega sale solo con sus fotos y su firma completas en S3; una foto cortada retoma las partes que faltan', async () => {
    casos.iniciarViaje('v1', null);
    casos.registrarLectura('v1', { lat: -17.8, lng: -63.2, velocidadMs: 0, precisionMetros: 4, en: ahora.getTime() });
    const op = casos.entregar('v1', ['camara/foto-grande.jpg'], { archivo: 'tmp/firma.png', nombreReceptor: ' María Rojas ' }, null, 4);
    expect(viajes.porId('v1')?.entregaLocal).toBe('ENTREGA');
    const entrega = cola.ops.find((o) => o.opId === op)!;
    expect(entrega.evidencias).toHaveLength(2);
    expect(entrega.cuerpo).toMatchObject({ firma: { nombreReceptor: 'María Rojas' }, posicion: { lat: -17.8 }, precisionMetros: 4 });

    // La foto de 12 MB va en 3 partes de 5 MB; la segunda tanda se corta.
    apiEvidencias.cortarEn = 3;
    await motor.sincronizar();
    expect(api.enviadas.filter((x) => x.startsWith('ENTREGA'))).toEqual([]);
    expect(entrega.intentos).toBe(1);
    ahora = new Date(Date.parse(entrega.proximoIntentoEn!));
    await motor.sincronizar();
    const [foto] = entrega.evidencias;
    const partesDeLaFoto = apiEvidencias.subidasDeParte.filter((u) => u.includes(foto));
    expect(partesDeLaFoto.filter((u) => u.endsWith('/3'))).toHaveLength(2);
    expect(partesDeLaFoto.filter((u) => u.endsWith('/1'))).toHaveLength(1);
    expect(apiEvidencias.completadas.map((c) => c.partes.map((p) => p.numero))).toEqual([[1, 2, 3], [1]]);
    expect(api.enviadas.filter((x) => x.startsWith('ENTREGA'))).toEqual([`ENTREGA:${op}`]);
  });

  it('T7.6: la carga de combustible usa su opId como clave y en el cuerpo, con el recibo subido antes', async () => {
    casos.iniciarViaje('v1', null);
    const op = casos.cargarCombustible('v1', { litros: 180.5, monto: '675.07', kilometraje: 184320, foto: 'camara/recibo.jpg' });
    const carga = cola.ops.find((o) => o.opId === op)!;
    expect(carga.cuerpo).toMatchObject({
      opId: op,
      litros: 180.5,
      monto: { monto: '675.07', moneda: 'BOB' },
      fotoReciboEvidenciaId: carga.evidencias[0],
    });
    await motor.sincronizar();
    expect(apiEvidencias.completadas.map((c) => c.id)).toEqual(carga.evidencias);
    expect(api.enviadas).toContain(`CARGA_COMBUSTIBLE:${op}`);
    expect(() => casos.cargarCombustible('v1', { litros: 0, monto: '10', kilometraje: 1, foto: null })).toThrow();
  });
});
