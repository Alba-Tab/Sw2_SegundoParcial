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
  type FatigaSinPosicion,
  type PosicionGuardada,
  type PuntosGps,
  SesionVencida,
  type Subida,
  type Viajes,
} from './puertos';
import { SubidaEvidencias } from './subidaEvidencias';

class ColaEnMemoria implements Cola {
  ops: Operacion[] = [];
  todas = () => this.ops.filter((o) => o.estado === 'PENDIENTE');
  visibles = () => this.ops.filter((o) => o.estado !== 'CONFIRMADA');
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
  contar = (viajeId?: string) => this.p.filter((x) => !viajeId || x.viajeId === viajeId).length;
}

class ViajesEnMemoria implements Viajes {
  v = new Map<string, ViajeLocal>();
  todos = () => [...this.v.values()];
  porId = (id: string) => this.v.get(id) ?? null;
  guardarDelServidor = (vs: ViajeLocal[]) => vs.forEach((x) => this.v.set(x.viajeId, x));
  marcarIniciado = (id: string) => void (this.v.get(id)!.iniciadoLocal = true);
  marcarCanceladoAlSincronizar = (id: string) => void (this.v.get(id)!.canceladoAlSincronizar = true);
  marcarEntregaLocal = (id: string, t: 'ENTREGA' | 'RECHAZO') => void (this.v.get(id)!.entregaLocal = t);
  liberarMarca = (id: string, t: 'INICIO' | 'ENTREGA' | 'RECHAZO') => {
    if (t === 'INICIO') this.v.get(id)!.iniciadoLocal = false;
    else this.v.get(id)!.entregaLocal = null;
  };
}

/** Responde con lo que haya en la cola de respuestas de cada clave (`TIPO:opId` o `GPS`), y registra cada envío. */
class ApiFalsa implements Api {
  respuestas = new Map<string, Respuesta[]>();
  enviadas: string[] = [];
  lotes: { puntos: number[]; loteId: string }[] = [];
  estado = 'EN_RUTA';
  /** Respuestas de `GET /viajes/{id}` antes de la normal (200 con `estado`). */
  respuestasEstado: Respuesta[] = [];
  cursorServidor: number | null = null;
  /** Viajes cuyo cursor lanza (un adaptador que no envolvió el corte de red). */
  cursorQueLanza = new Set<string>();
  /** Operaciones cuyo envío lanza en vez de devolver una respuesta. */
  lanzaAlEnviar = new Set<string>();
  responder(clave: string, ...r: Respuesta[]) {
    this.respuestas.set(clave, r);
  }
  private siguiente(clave: string): Respuesta {
    const cola = this.respuestas.get(clave);
    return (cola && cola.length > 1 ? cola.shift() : cola?.[0]) ?? { estado: 200 };
  }
  enviar = async (op: Operacion) => {
    this.enviadas.push(`${op.tipo}:${op.opId}`);
    if (this.lanzaAlEnviar.has(op.opId)) throw new TypeError('Network request failed');
    return this.siguiente(`${op.tipo}:${op.opId}`);
  };
  enviarLoteGps = async (_v: string, _d: string, puntos: PuntoGps[], loteId: string) => {
    this.lotes.push({ puntos: puntos.map((p) => p.seq), loteId });
    return this.siguiente('GPS');
  };
  estadoDelViaje = async (): Promise<Respuesta> => this.respuestasEstado.shift() ?? { estado: 200, cuerpo: { estado: this.estado } };
  misViajes = async () => [];
  cursor = async (_d: string, viajeId: string) => {
    if (this.cursorQueLanza.has(viajeId)) throw new TypeError('Network request failed');
    return this.cursorServidor;
  };
  registrarDispositivo = async () => ({ estado: 200 });
}

class PosicionEnMemoria implements PosicionGuardada {
  p: { lat: number; lng: number } | null = null;
  leer = () => this.p;
  guardar = (p: { lat: number; lng: number }) => void (this.p = p);
  borrar = () => void (this.p = null);
}

class FatigasEnMemoria {
  f: FatigaSinPosicion[] = [];
  leer = () => this.f;
  guardar = (f: FatigaSinPosicion[]) => void (this.f = f);
}

class EvidenciasEnMemoria implements Evidencias {
  e = new Map<string, EvidenciaLocal>();
  agregar = (x: EvidenciaLocal) => void this.e.set(x.evidenciaId, x);
  porId = (id: string) => this.e.get(id) ?? null;
  marcarCompleta = (id: string) => void (this.e.get(id)!.estado = 'COMPLETA');
  borrar = (id: string) => void this.e.delete(id);
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
  let evidencias: EvidenciasEnMemoria, apiEvidencias: ApiEvidenciasFalsa, posicion: PosicionEnMemoria, fatigas: FatigasEnMemoria;
  let motor: MotorSincronizacion, casos: CasosDeUso;
  let borrados: string[];

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
    borrados = [];
    const archivos = {
      guardar: (o: string, n: string) => {
        if (o.includes('rota')) throw new Error('foto rota');
        return { archivo: `doc/${n}`, tamanoBytes: o.includes('grande') ? 12 * 1024 * 1024 : 2048 };
      },
      leer: (_a: string, d: number, h: number) => new Uint8Array(h - d),
      existe: () => true,
      borrar: (a: string) => void borrados.push(a),
    };
    const subida = new SubidaEvidencias(evidencias, apiEvidencias, archivos);
    motor = new MotorSincronizacion(cola, puntos, viajes, api, sesion, red, reloj, ids, dispositivo, subida, () => 0.5);
    posicion = new PosicionEnMemoria();
    fatigas = new FatigasEnMemoria();
    const enTransaccion = <T>(fn: () => T) => fn();
    casos = new CasosDeUso(
      cola,
      puntos,
      viajes,
      api,
      sesion,
      reloj,
      ids,
      dispositivo,
      evidencias,
      archivos,
      posicion,
      enTransaccion,
      fatigas,
    );
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
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 20, precisionMetros: 5, en: ahora.getTime() });
    const op = casos.registrarFatiga('v1')!;
    const fatiga = cola.ops.find((o) => o.opId === op)!;
    expect(fatiga.tipo).toBe('EVENTO_CONDUCCION');
    expect(fatiga.cuerpo).toMatchObject({ tipo: 'ALERTA_FATIGA', posicion: { lat: -17.7, lng: -63.18 } });
    expect(fatiga.cuerpo).not.toHaveProperty('magnitudG');
  });

  it('T7.4: el hito va a la cola con el texto revisado y la posición; sin GPS o con texto corto, no', () => {
    expect(() => casos.registrarHito('v1', 'BLOQUEO', 'Bloqueo en el puente', 'VOZ')).toThrow(/ya no está en ruta/);
    casos.iniciarViaje('v1', null);
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

  it('409 CONFLICTO_ESTADO sin poder preguntar el estado (corte o 5xx): reintenta con la misma clave, no queda FALLIDA', async () => {
    const inicio = casos.iniciarViaje('v1', null);
    api.responder(`INICIO:${inicio}`, { estado: 409, codigo: 'CONFLICTO_ESTADO' });
    api.respuestasEstado = [{ estado: 'SIN_RED' }, { estado: 503 }];
    const op = cola.ops[0];
    await motor.sincronizar();
    expect(op).toMatchObject({ estado: 'PENDIENTE', intentos: 1 });
    ahora = new Date(Date.parse(op.proximoIntentoEn!));
    await motor.sincronizar();
    expect(op).toMatchObject({ estado: 'PENDIENTE', intentos: 2 });

    ahora = new Date(Date.parse(op.proximoIntentoEn!));
    api.estado = 'CANCELADO';
    expect((await motor.sincronizar()).cancelados).toEqual(['v1']);
    expect(op.estado).toBe('DESCARTADA');
    expect(new Set(api.enviadas)).toEqual(new Set([`INICIO:${inicio}`]));
  });

  it('409 CONFLICTO_ESTADO con el viaje en otro estado: FALLIDA con su código', async () => {
    const inicio = casos.iniciarViaje('v1', null);
    api.responder(`INICIO:${inicio}`, { estado: 409, codigo: 'CONFLICTO_ESTADO' });
    api.estado = 'ENTREGADO';
    await motor.sincronizar();
    expect(cola.ops[0]).toMatchObject({ estado: 'FALLIDA', codigoError: 'CONFLICTO_ESTADO' });
  });

  it('una entrega FALLIDA libera la marca: se registra de nuevo con otra clave y, si el viaje ya no está en ruta, el 409 queda a la vista', async () => {
    casos.iniciarViaje('v1', null);
    casos.registrarLectura('v1', { lat: -17.8, lng: -63.2, velocidadMs: 0, precisionMetros: 4, en: ahora.getTime() });
    const primera = casos.entregar('v1', ['foto1.jpg'], null, null, null);
    api.responder(`ENTREGA:${primera}`, { estado: 422, codigo: 'VALIDACION' });
    await motor.sincronizar();
    expect(cola.ops.find((o) => o.opId === primera)).toMatchObject({ estado: 'FALLIDA', codigoError: 'VALIDACION' });
    expect(viajes.porId('v1')?.entregaLocal).toBeNull();

    const segunda = casos.entregar('v1', ['foto2.jpg'], null, null, null);
    expect(segunda).not.toBe(primera);
    const cuerpos = [primera, segunda].map((id) => cola.ops.find((o) => o.opId === id)!.cuerpo.entregaId);
    expect(cuerpos[0]).not.toBe(cuerpos[1]);
    expect(viajes.porId('v1')?.entregaLocal).toBe('ENTREGA');
    api.responder(`ENTREGA:${segunda}`, { estado: 409, codigo: 'CONFLICTO_ESTADO' });
    api.estado = 'ENTREGADO';
    await motor.sincronizar();
    expect(cola.ops.find((o) => o.opId === segunda)).toMatchObject({ estado: 'FALLIDA', codigoError: 'CONFLICTO_ESTADO' });
    expect(viajes.porId('v1')?.entregaLocal).toBeNull();
  });

  it('un rechazo FALLIDA también libera la marca; uno confirmado no', async () => {
    casos.iniciarViaje('v1', null);
    casos.registrarLectura('v1', { lat: -17.8, lng: -63.2, velocidadMs: 0, precisionMetros: 4, en: ahora.getTime() });
    const rechazo = casos.rechazar('v1', 'Carga mojada', ['foto1.jpg']);
    api.responder(`RECHAZO:${rechazo}`, { estado: 422, codigo: 'VALIDACION' });
    await motor.sincronizar();
    expect(viajes.porId('v1')?.entregaLocal).toBeNull();
    casos.rechazar('v1', 'Carga mojada', ['foto2.jpg']);
    await motor.sincronizar();
    expect(viajes.porId('v1')?.entregaLocal).toBe('RECHAZO');
  });

  it('un inicio FALLIDA libera la marca y el chofer puede iniciar de nuevo', async () => {
    const inicio = casos.iniciarViaje('v1', null);
    api.responder(`INICIO:${inicio}`, { estado: 422, codigo: 'VALIDACION' });
    await motor.sincronizar();
    expect(viajes.porId('v1')?.iniciadoLocal).toBe(false);
    const otro = casos.iniciarViaje('v1', null);
    expect(otro).not.toBe(inicio);
    expect(viajes.porId('v1')?.iniciadoLocal).toBe(true);
  });

  it('un envío que lanza no rompe la tanda: esa operación se reintenta y los otros viajes siguen', async () => {
    viajes.guardarDelServidor([viaje('v2')]);
    const malo = casos.encolar('v1', 'HITO', { tipo: 'PARADA' });
    const bueno = casos.encolar('v2', 'HITO', { tipo: 'PARADA' });
    api.lanzaAlEnviar.add(malo);
    const r = await motor.sincronizar();
    expect(r.confirmadas).toBe(1);
    expect(cola.ops.find((o) => o.opId === malo)).toMatchObject({ estado: 'PENDIENTE', intentos: 1 });
    expect(cola.ops.find((o) => o.opId === bueno)?.estado).toBe('CONFIRMADA');
  });

  it('al abrir, un cursor que falla por red no rechaza ni impide limpiar los otros viajes', async () => {
    for (let s = 0; s < 5; s++) gps(s);
    puntos.agregar({
      viajeId: 'v2',
      seq: 0,
      registradaEn: ahora.toISOString(),
      lat: -17.7,
      lng: -63.1,
      velocidadKmh: 0,
      precisionMetros: null,
    });
    api.cursorServidor = 3;
    api.cursorQueLanza.add('v1');
    await expect(motor.recuperarCursor()).resolves.toBeUndefined();
    expect(puntos.pendientes('v1', 100)).toHaveLength(5);
    expect(puntos.pendientes('v2', 100)).toHaveLength(0);
  });

  it('al abrir sin señal o con la sesión vencida, la limpieza del cursor no rechaza (la sincronización inicial corre igual)', async () => {
    gps(0);
    conRed = false;
    await expect(motor.recuperarCursor()).resolves.toBeUndefined();
    conRed = true;
    sesionVencida = true;
    await expect(motor.recuperarCursor()).resolves.toBeUndefined();
    expect(puntos.contar()).toBe(1);
  });

  it('T7.7: sin GPS en esta sesión, la alerta de fatiga y la frenada salen con la última posición guardada', () => {
    posicion.p = { lat: -17.75, lng: -63.17 };
    const op = casos.registrarFatiga('v1')!;
    expect(cola.ops.find((o) => o.opId === op)?.cuerpo).toMatchObject({ tipo: 'ALERTA_FATIGA', posicion: { lat: -17.75, lng: -63.17 } });
    const frenada = casos.registrarFrenada('v1', 0.6)!;
    expect(cola.ops.find((o) => o.opId === frenada)?.cuerpo).toMatchObject({ posicion: { lat: -17.75, lng: -63.17 } });
  });

  it('sin ninguna posición conocida, la alerta de fatiga se guarda con su hora y sale con la primera lectura del GPS', () => {
    const alerta = ahora.toISOString();
    expect(casos.registrarFatiga('v1')).toBeNull();
    expect(cola.ops).toHaveLength(0);
    expect(fatigas.f).toEqual([{ viajeId: 'v1', eventoId: 'id-1', registradoEn: alerta }]);

    ahora = new Date(ahora.getTime() + 60_000);
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 20, precisionMetros: 5, en: ahora.getTime() });
    expect(fatigas.f).toEqual([]);
    expect(cola.ops).toHaveLength(1);
    expect(cola.ops[0]).toMatchObject({ viajeId: 'v1', tipo: 'EVENTO_CONDUCCION' });
    expect(cola.ops[0].cuerpo).toEqual({
      eventoId: 'id-1',
      tipo: 'ALERTA_FATIGA',
      posicion: { lat: -17.7, lng: -63.18 },
      registradoEn: alerta,
    });

    casos.registrarLectura('v1', { lat: -17.71, lng: -63.18, velocidadMs: 20, precisionMetros: 5, en: ahora.getTime() + 30_000 });
    expect(cola.ops).toHaveLength(1);
  });

  it('E2-1: la velocidad sale del GPS; con -1 se calcula por distancia y tiempo; con la lectura de más de 10 s no se sabe', () => {
    const t0 = ahora.getTime();
    const lectura = (en: number, lat: number, velocidadMs: number) => ({ lat, lng: -63.18, velocidadMs, precisionMetros: 5, en: t0 + en });
    expect(casos.velocidadKmh()).toBeNull();
    casos.registrarLectura('v1', lectura(0, -17.7, -1));
    expect(casos.velocidadKmh()).toBeNull();
    // 0,001° de latitud son 111,2 m; en 10 s, 40 km/h.
    ahora = new Date(t0 + 10_000);
    casos.registrarLectura('v1', lectura(10_000, -17.701, -1));
    expect(casos.velocidadKmh()).toBe(40);
    casos.registrarLectura('v1', lectura(10_000, -17.701, 2));
    expect(casos.velocidadKmh()).toBe(7.2);
    ahora = new Date(t0 + 20_001);
    expect(casos.velocidadKmh()).toBeNull();
  });

  it('E12-1: la alerta guardada sale solo con una lectura de su viaje', () => {
    viajes.guardarDelServidor([viaje('v2')]);
    casos.registrarFatiga('v1');
    casos.registrarLectura('v2', { lat: -17.6, lng: -63.1, velocidadMs: 20, precisionMetros: 5, en: ahora.getTime() });
    expect(cola.ops).toHaveLength(0);
    expect(fatigas.f.map((f) => f.viajeId)).toEqual(['v1']);
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 20, precisionMetros: 5, en: ahora.getTime() });
    expect(cola.ops.map((o) => [o.viajeId, o.cuerpo.posicion])).toEqual([['v1', { lat: -17.7, lng: -63.18 }]]);
    expect(fatigas.f).toEqual([]);
  });

  it('cada lectura del GPS queda guardada como última posición; olvidar limpia la memoria', () => {
    casos.registrarLectura('v1', { lat: -17.71, lng: -63.18, velocidadMs: 10, precisionMetros: 5, en: ahora.getTime() });
    expect(posicion.p).toEqual({ lat: -17.71, lng: -63.18 });
    casos.olvidar();
    expect(casos.ultimaPosicion()).toBeNull();
    expect(casos.velocidadKmh()).toBeNull();
  });

  it('T7.6: el monto escrito con coma o sin decimales se normaliza como texto; uno inválido no entra a la cola', () => {
    casos.iniciarViaje('v1', null);
    const cargar = (monto: string) => casos.cargarCombustible('v1', { litros: 100, monto, kilometraje: 1, foto: null });
    const montoDe = (opId: string) => cola.ops.find((o) => o.opId === opId)?.cuerpo.monto;
    expect(montoDe(cargar('675,5'))).toEqual({ monto: '675.50', moneda: 'BOB' });
    expect(montoDe(cargar(' 0675 '))).toEqual({ monto: '675.00', moneda: 'BOB' });
    expect(montoDe(cargar('999999999999.99'))).toEqual({ monto: '999999999999.99', moneda: 'BOB' });
    for (const malo of ['1.234', '1,2,3', '-5', '1e3', '', '0,00', '1234567890123', 'Infinity']) expect(() => cargar(malo)).toThrow();
    expect(cola.ops.filter((o) => o.tipo === 'CARGA_COMBUSTIBLE')).toHaveLength(3);
  });

  it('A-2: si falla la segunda foto de la entrega, no queda ninguna evidencia ni operación a medias', () => {
    casos.iniciarViaje('v1', null);
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 0, precisionMetros: 5, en: ahora.getTime() });
    const antes = cola.ops.length;
    expect(() => casos.entregar('v1', ['foto1.jpg', 'rota.jpg'], null, null, null)).toThrow(/rota/);
    expect(evidencias.e.size).toBe(0);
    expect(cola.ops).toHaveLength(antes);
    expect(borrados).toHaveLength(1);
  });

  it('C-1: si falla la cola después de copiar las fotos, se borran las copias y sale el error original', () => {
    casos.iniciarViaje('v1', null);
    casos.registrarLectura('v1', { lat: -17.7, lng: -63.18, velocidadMs: 0, precisionMetros: 5, en: ahora.getTime() });
    const agregar = cola.agregar;
    cola.agregar = () => {
      throw new Error('disco lleno');
    };
    expect(() => casos.entregar('v1', ['foto1.jpg', 'foto2.jpg'], null, null, null)).toThrow('disco lleno');
    cola.agregar = agregar;
    expect(borrados).toHaveLength(2);
    expect(evidencias.e.size).toBe(0);
  });
});
