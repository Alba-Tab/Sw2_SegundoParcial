/**
 * Gateway de punta a punta contra un Keycloak y 4 servicios falsos en un servidor HTTP local (spec 016): permisos por
 * campo, respuesta parcial, tiempos de espera, límites, idempotencia, DataLoader, descarga con HMAC y suscripción.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import WebSocket from 'ws';

type Manejador = (
  req: IncomingMessage,
  cuerpo: string,
  url: URL,
) => { status?: number; json?: unknown; demoraMs?: number; binario?: Buffer } | undefined;

let servidor: Server;
let base: string;
let app: INestApplication;
let gateway: string;
let llave: CryptoKey;
const pedidos: { metodo: string; ruta: string; cabeceras: IncomingMessage['headers']; cuerpo: string }[] = [];
const rutas = new Map<string, Manejador>();

const VIAJE = (id: string, servicioId = 's1') => ({
  viajeId: id,
  servicioId,
  estado: 'EN_RUTA',
  cliente: { clienteId: 'c1', razonSocial: 'Agroexport SRL' },
  ruta: { rutaId: 'r1', nombre: 'Aula', origen: { nombre: 'Santa Cruz' }, destino: { nombre: 'Aula' }, distanciaKm: 120 },
  tipoCarga: 'GRANOS',
  toneladas: 28,
  fechaViaje: '2026-11-03',
  placa: '4521KTR',
  choferNombre: 'Marco Quispe',
  ultimaPosicion: { posicion: { lat: -17.7, lng: -63.1 }, velocidadKmh: 50, registradaEn: '2026-11-03T12:00:00Z' },
});

async function token(roles: string[], sub = 'u1', segundos = 300) {
  return new SignJWT({ realm_access: { roles }, preferred_username: sub })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`${base}/realms/transporte`)
    .setAudience('gateway')
    .setSubject(sub)
    .setExpirationTime(Math.floor(Date.now() / 1000) + segundos)
    .sign(llave);
}

const gql = async (roles: string[], query: string, variables?: unknown) =>
  request(app.getHttpServer())
    .post('/graphql')
    .set('Authorization', `Bearer ${await token(roles)}`)
    .send({ query, variables });

beforeAll(async () => {
  const par = await generateKeyPair('RS256');
  llave = par.privateKey;
  const jwks = { keys: [{ ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
  servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', async () => {
      const url = new URL(req.url ?? '/', base);
      pedidos.push({ metodo: req.method ?? '', ruta: url.pathname + url.search, cabeceras: req.headers, cuerpo });
      if (url.pathname.endsWith('/certs')) return res.end(JSON.stringify(jwks));
      if (url.pathname.endsWith('/token')) {
        const f = new URLSearchParams(cuerpo);
        return res.end(JSON.stringify({ access_token: `intercambiado-${f.get('audience') ?? f.get('scope')}`, expires_in: 300 }));
      }
      const r = rutas.get(`${req.method} ${url.pathname}`)?.(req, cuerpo, url);
      if (!r) return res.writeHead(404).end(JSON.stringify({ codigo: 'NO_ENCONTRADO', detail: 'no existe' }));
      if (r.demoraMs) await new Promise((ok) => setTimeout(ok, r.demoraMs));
      if (r.binario) {
        res.writeHead(200, {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="x.xlsx"',
        });
        return res.end(r.binario);
      }
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json' }).end(JSON.stringify(r.json ?? {}));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    OIDC_ISSUER: `${base}/realms/transporte`,
    OIDC_CLIENTE_SECRETO: 'secreto',
    VIAJES_URL: `${base}/viajes`,
    FLOTA_URL: `${base}/flota`,
    FINANZAS_URL: `${base}/finanzas`,
    ANALITICA_URL: `${base}/analitica`,
    EXPORTACION_HMAC_SECRETO: 'hmac-de-prueba',
    GATEWAY_URL: 'http://gateway.prueba',
    ESQUEMA_GRAPHQL: `${__dirname}/../../../contratos/graphql/centro-control.graphql`,
  });
  const { AppModule } = await import('../src/app.module');
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  await app.listen(0, '127.0.0.1');
  gateway = `127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app?.close();
  servidor?.close();
});

beforeEach(() => {
  pedidos.length = 0;
  rutas.clear();
  rutas.set('GET /viajes/api/v1/viajes', () => ({ json: { items: [VIAJE('v1'), VIAJE('v2'), VIAJE('v3', 's2')] } }));
  rutas.set('GET /viajes/api/v1/servicios/s1', () => ({ json: { servicioId: 's1', monto: { monto: '2800.00', moneda: 'BOB' } } }));
  rutas.set('GET /viajes/api/v1/servicios/s2', () => ({ json: { servicioId: 's2', monto: { monto: '7600.00', moneda: 'BOB' } } }));
  rutas.set('GET /flota/api/v1/unidades', () => ({ json: { items: [{ unidadId: 'u1', placa: '4521KTR', estado: 'EN_VIAJE' }] } }));
  rutas.set('GET /finanzas/api/v1/facturas', () => ({
    json: { items: [{ facturaId: 'f1', saldo: { monto: '7600.00' }, vencida: false, venceEl: '2026-01-01' }] },
  }));
  rutas.set('GET /analitica/api/v1/alertas', () => ({
    json: { alertas: [], abiertas: 2, datosAl: '2026-11-03T12:00:00Z', siguienteCursor: null },
  }));
});

const TABLERO =
  '{ tablero(periodo: ESTA_SEMANA) { viajesEnCurso { viajeId } unidadesPorEstado { estado cantidad } cuentasPorCobrar { saldoTotal } alertasAbiertas } }';

describe('Gateway (spec 016)', () => {
  it('FK1: sin token 401; cliente 403; el token se intercambia por servicio y nunca se reenvía', async () => {
    await request(app.getHttpServer()).post('/graphql').send({ query: '{ yo { sub } }' }).expect(401);
    const cliente = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${await token(['cliente'])}`)
      .send({ query: '{ yo { sub } }' });
    expect(cliente.status).toBe(403);
    expect(cliente.body.codigo).toBe('SIN_PERMISO');
    const r = await gql(['gerente'], TABLERO);
    expect(r.body.errors).toBeUndefined();
    const aServicios = pedidos.filter((p) => !p.ruta.includes('openid-connect'));
    expect(new Set(aServicios.map((p) => p.cabeceras.authorization))).toEqual(
      new Set([
        'Bearer intercambiado-viajes',
        'Bearer intercambiado-flota',
        'Bearer intercambiado-finanzas',
        'Bearer intercambiado-analitica',
      ]),
    );
    expect(aServicios.every((p) => p.cabeceras['x-correlation-id'] && /^00-[0-9a-f]{32}-/.test(String(p.cabeceras.traceparent)))).toBe(
      true,
    );
  });

  it('permisos por campo: el despachador no ve montos ni cuentas por cobrar', async () => {
    const r = await gql(
      ['despachador'],
      '{ viajesEnCurso { viajeId monto } tablero(periodo: HOY) { cuentasPorCobrar { saldoTotal } alertasAbiertas } }',
    );
    expect(r.status).toBe(200);
    expect(r.body.data.viajesEnCurso.map((v: { monto: unknown }) => v.monto)).toEqual([null, null, null]);
    expect(r.body.data.tablero).toEqual({ cuentasPorCobrar: null, alertasAbiertas: 2 });
    expect(new Set(r.body.errors.map((e: { extensions: { codigo: string } }) => e.extensions.codigo))).toEqual(new Set(['SIN_PERMISO']));
    const g = await gql(['gerente'], '{ viajesEnCurso { monto } }');
    expect(g.body.data.viajesEnCurso.map((v: { monto: string }) => v.monto)).toEqual(['2800.00', '2800.00', '7600.00']);
    // DataLoader: s1 se pidió una sola vez para dos viajes.
    expect(pedidos.filter((p) => p.ruta === '/viajes/api/v1/servicios/s1')).toHaveLength(1);
  });

  it('FR1: Flota caída → sus campos en null con DEPENDENCIA_NO_DISPONIBLE y el resto sale', async () => {
    rutas.set('GET /flota/api/v1/unidades', () => ({ status: 503 }));
    const r = await gql(['gerente'], TABLERO);
    expect(r.status).toBe(200);
    expect(r.body.data.tablero.unidadesPorEstado).toBeNull();
    expect(r.body.data.tablero.viajesEnCurso).toHaveLength(3);
    expect(r.body.data.tablero.cuentasPorCobrar.saldoTotal).toBe('7600.00');
    expect(r.body.errors[0]).toMatchObject({
      path: ['tablero', 'unidadesPorEstado'],
      extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE', servicio: 'flota' },
    });
  });

  it('FC6: un servicio lento pasa los 3 s y no frena la respuesta', async () => {
    rutas.set('GET /finanzas/api/v1/facturas', () => ({ demoraMs: 5000, json: { items: [] } }));
    const inicio = Date.now();
    const r = await gql(['gerente'], TABLERO);
    expect(Date.now() - inicio).toBeLessThan(3500);
    expect(r.body.data.tablero.cuentasPorCobrar).toBeNull();
    expect(r.body.errors[0].extensions.codigo).toBe('DEPENDENCIA_NO_DISPONIBLE');
  });

  it('límites (D101): una consulta demasiado compleja no llama a ningún servicio', async () => {
    const r = await gql(['gerente'], '{ viajes(limite: 100) { hitos(limite: 100) { tipo descripcion } } }');
    expect(r.body.errors[0].extensions.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    expect(pedidos.filter((p) => !p.ruta.includes('openid-connect'))).toHaveLength(0);
  });

  it('mutaciones: la claveIdempotencia viaja como Idempotency-Key y el error del servicio llega con su código', async () => {
    rutas.set('POST /finanzas/api/v1/facturas/f1/pagos', () => ({ status: 201, json: {} }));
    rutas.set('GET /finanzas/api/v1/facturas/f1', () => ({
      json: {
        facturaId: 'f1',
        numero: 'FAC-000001',
        viajeId: 'v1',
        servicioId: 's1',
        clienteId: 'c1',
        razonSocial: 'A',
        monto: { monto: '7600.00' },
        saldo: { monto: '0.00' },
        estado: 'PAGADA',
        emitidaEl: '2026-10-01',
        venceEl: '2026-11-01',
        vencida: false,
      },
    }));
    const pago = `mutation($i: PagoInput!) { registrarPago(input: $i) { estado saldo } }`;
    const input = {
      facturaId: 'f1',
      monto: '7600.00',
      fecha: '2026-11-03',
      medio: 'TRANSFERENCIA',
      referencia: 'BNB-1',
      claveIdempotencia: 'clave-1',
    };
    expect((await gql(['gerente'], pago, { i: input })).body.errors[0].extensions.codigo).toBe('SIN_PERMISO');
    const r = await gql(['administracion'], pago, { i: input });
    expect(r.body.data.registrarPago).toEqual({ estado: 'PAGADA', saldo: '0.00' });
    const post = pedidos.find((p) => p.metodo === 'POST' && p.ruta.endsWith('/pagos'))!;
    expect(post.cabeceras['idempotency-key']).toBe('clave-1');
    expect(JSON.parse(post.cuerpo)).toEqual({
      fecha: '2026-11-03',
      medio: 'TRANSFERENCIA',
      referencia: 'BNB-1',
      monto: { monto: '7600.00', moneda: 'BOB' },
    });
    rutas.set('POST /viajes/api/v1/viajes/v1/entrega/aprobacion', () => ({
      status: 409,
      json: { codigo: 'CONFLICTO_ESTADO', detail: 'El viaje no está observado' },
    }));
    const c = await gql(['despachador'], 'mutation { aprobarEntregaObservada(viajeId: "v1", claveIdempotencia: "k") { estado } }');
    expect(c.body.errors[0]).toMatchObject({
      message: 'El viaje no está observado',
      extensions: { codigo: 'CONFLICTO_ESTADO', status: 409 },
    });
  });

  it('D21: exportar devuelve un enlace HMAC; la descarga valida firma y vencimiento sin Authorization', async () => {
    const expira = new Date(Date.now() + 600_000).toISOString();
    rutas.set('POST /analitica/api/v1/exportaciones', () => ({
      status: 201,
      json: { exportacionId: 'e1', nombreArchivo: 'x.xlsx', expiraEn: expira },
    }));
    rutas.set('GET /analitica/api/v1/exportaciones/e1/archivo', () => ({ binario: Buffer.from('PK-excel') }));
    const r = await gql(['gerente'], 'mutation { exportarReporte(id: CUENTAS_POR_COBRAR, claveIdempotencia: "k1") { url nombreArchivo } }');
    const url: string = r.body.data.exportarReporte.url;
    expect(url.startsWith('http://gateway.prueba/exportaciones/')).toBe(true);
    const ruta = url.replace('http://gateway.prueba', '');
    const ok = await request(app.getHttpServer()).get(ruta).buffer(true);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    const archivo = pedidos.find((p) => p.ruta.endsWith('/archivo'))!;
    expect(archivo.cabeceras['x-solicitante-sub']).toBe('u1');
    expect(archivo.cabeceras.authorization).toBe('Bearer intercambiado-aud-analitica');
    const alterado = ruta.slice(0, -2) + (ruta.endsWith('A') ? 'BB' : 'AA');
    expect((await request(app.getHttpServer()).get(alterado)).status).toBe(403);
    const { firmarDescarga } = await import('../src/graphql/resolvers');
    const vencido = firmarDescarga('hmac-de-prueba', 'e1', 'u1', Math.floor(Date.now() / 1000) - 1);
    expect((await request(app.getHttpServer()).get(`/exportaciones/${vencido}`)).body.codigo).toBe('EXPORTACION_VENCIDA');
  });

  it('suscripción: 4401 sin token válido, 4403 para clientes y alertas nuevas para el despachador', async () => {
    const cerrar = (authorization: string) =>
      new Promise<number>((ok) => {
        const ws = new WebSocket(`ws://${gateway}/graphql`, 'graphql-transport-ws');
        ws.on('open', () => ws.send(JSON.stringify({ type: 'connection_init', payload: { authorization } })));
        ws.on('close', (codigo) => ok(codigo));
      });
    expect(await cerrar('Bearer basura')).toBe(4401);
    expect(await cerrar(`Bearer ${await token(['cliente'])}`)).toBe(4403);

    let vuelta = 0;
    rutas.set('GET /analitica/api/v1/alertas', () => {
      vuelta++;
      const alerta = {
        alertaId: 'a1',
        secuencia: 7,
        tipo: 'RIESGO_RETRASO',
        severidad: 'ALTA',
        titulo: 'Riesgo',
        detalle: 'd',
        entidad: { tipo: 'VIAJE', id: 'v1' },
        enlace: '/x',
        estado: 'ABIERTA',
        creadaEn: '2026-11-03T12:00:00Z',
        origen: 'modelo',
      };
      return { json: { alertas: vuelta === 2 ? [alerta] : [], siguienteCursor: vuelta >= 2 ? 'czo3' : null, abiertas: 1 } };
    });
    const t = await token(['despachador']);
    const alerta = await new Promise<{ titulo: string }>((ok, mal) => {
      const ws = new WebSocket(`ws://${gateway}/graphql`, 'graphql-transport-ws');
      ws.on('open', () => ws.send(JSON.stringify({ type: 'connection_init', payload: { authorization: `Bearer ${t}` } })));
      ws.on('message', (datos) => {
        const m = JSON.parse(String(datos));
        if (m.type === 'connection_ack')
          ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query: 'subscription { alertas { titulo secuencia } }' } }));
        if (m.type === 'next') {
          ws.close();
          ok(m.payload.data.alertas);
        }
      });
      ws.on('close', (c) => c !== 1005 && c !== 1000 && mal(new Error(`cerró ${c}`)));
    });
    expect(alerta).toEqual({ titulo: 'Riesgo', secuencia: 7 });
  });
});

describe('suscripción al cerrar', () => {
  it('return() corta la espera y no vuelve a consultar a Analítica', async () => {
    const { alertasNuevas } = await import('../src/graphql/suscripcion');
    let consultas = 0;
    const servicios = { get: async () => (consultas++, { alertas: [], siguienteCursor: null }) } as never;
    const it = alertasNuevas(servicios, {} as never, 50);
    const siguiente = it.next();
    await new Promise((ok) => setTimeout(ok, 120));
    await it.return!();
    await expect(siguiente).resolves.toEqual({ done: true, value: undefined });
    const antes = consultas;
    await new Promise((ok) => setTimeout(ok, 200));
    expect(consultas).toBe(antes);
  });
});
