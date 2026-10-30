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
) => { status?: number; json?: unknown; texto?: string; demoraMs?: number; binario?: Buffer; alTerminar?: () => void } | undefined;

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
      r.alTerminar?.();
      if (r.texto !== undefined) return res.writeHead(r.status ?? 200, { 'content-type': 'application/json' }).end(r.texto);
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
    const facturaPagada = {
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
    };
    // registrarPago responde 201 con la factura actualizada (contrato): el Gateway no la relee.
    rutas.set('POST /finanzas/api/v1/facturas/f1/pagos', () => ({ status: 201, json: facturaPagada }));
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
    expect(pedidos.filter((p) => p.metodo === 'GET' && p.ruta.startsWith('/finanzas/api/v1/facturas/f1'))).toHaveLength(0);
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

// Sin la última vuelta de la suscripción de la prueba anterior, que puede seguir en vuelo al cerrar.
const aServicios = () => pedidos.filter((p) => !p.ruta.includes('openid-connect') && !p.ruta.startsWith('/analitica/api/v1/alertas'));
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('revisión del Gateway', () => {
  it('limite fuera de 1–100 → VALIDACION sin llamar a Viajes; null cuenta como el valor por defecto', async () => {
    for (const limite of [-5, 0, 101]) {
      const r = await gql(['gerente'], `{ viajes(limite: ${limite}) { viajeId } }`);
      expect(r.body.errors[0].extensions).toMatchObject({ codigo: 'VALIDACION', status: 400 });
    }
    // Antes, un limite negativo bajaba la complejidad y la consulta llegaba a Viajes con limite=-100.
    const negativo = await gql(['gerente'], '{ viajes(limite: -100) { hitos(limite: 100) { tipo descripcion } } }');
    expect(negativo.body.errors[0].extensions.codigo).toBe('VALIDACION');
    const nulo = await gql(['gerente'], '{ viajes(limite: null) { hitos(limite: 100) { tipo descripcion } } }');
    expect(nulo.body.errors[0].extensions.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    expect(aServicios()).toHaveLength(0);
    const ok = await gql(['gerente'], '{ viajes(limite: null) { viajeId } }');
    expect(ok.body.data.viajes).toHaveLength(3);
    expect(aServicios().map((p) => p.ruta)).toEqual(['/viajes/api/v1/viajes?limite=50']);
  });

  it('rutas: listarRutas devuelve un arreglo plano (contrato) y el Gateway lo compone', async () => {
    rutas.set('GET /viajes/api/v1/rutas', () => ({
      json: [
        {
          rutaId: 'r1',
          nombre: 'Santa Cruz – La Paz',
          origen: { nombre: 'Santa Cruz', coordenadas: { lat: -17.78, lng: -63.18 } },
          destino: { nombre: 'La Paz', coordenadas: { lat: -16.5, lng: -68.15 }, radioMetros: 300 },
          distanciaKm: 850,
          activa: true,
        },
      ],
    }));
    const r = await gql(['gerente'], '{ rutas { rutaId nombre origen destino distanciaKm } }');
    expect(r.body.data.rutas).toEqual([
      { rutaId: 'r1', nombre: 'Santa Cruz – La Paz', origen: 'Santa Cruz', destino: 'La Paz', distanciaKm: 850 },
    ]);
  });

  it('un id con ../, ? o / no cambia la operación REST: VALIDACION sin llamar al servicio', async () => {
    for (const id of ['../rutas', '..', 'v1?x=1', 'v1/hitos', 'v1#a', '%2e%2e']) {
      const r = await gql(['gerente'], 'query($id: ID!) { viaje(id: $id) { viajeId } }', { id });
      expect(r.body.errors[0].extensions.codigo).toBe('VALIDACION');
    }
    const m = await gql(
      ['despachador'],
      'mutation { cancelarServicio(servicioId: "../../viajes/v2/hitos", motivo: "x", claveIdempotencia: "k") { estado } }',
    );
    expect(m.body.errors[0].extensions.codigo).toBe('VALIDACION');
    expect(aServicios()).toHaveLength(0);
  });

  it('errores de la petición → 400 VALIDACION (no 500); un error interno se registra en JSON antes de enmascararlo', async () => {
    const sintaxis = await gql(['gerente'], '{ viajes { ');
    expect(sintaxis.status).toBe(400);
    expect(sintaxis.body.errors[0].extensions).toMatchObject({ codigo: 'VALIDACION', status: 400 });
    const sinVariable = await gql(['gerente'], 'query($l: Int!) { viajes(limite: $l) { viajeId } }');
    expect(sinVariable.status).toBe(400);
    expect(sinVariable.body.errors[0].extensions.codigo).toBe('VALIDACION');
    const otroTipo = await gql(['gerente'], 'query($l: Int) { viajes(limite: $l) { viajeId } }', { l: 'muchos' });
    expect(otroTipo.status).toBe(400);
    expect(otroTipo.body.errors[0].extensions.codigo).toBe('VALIDACION');
    const conToken = async (cuerpo: object) =>
      request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${await token(['gerente'])}`)
        .send(cuerpo);
    const operacion = await conToken({ query: 'query A { yo { sub } }', operationName: 'B' });
    expect(operacion.status).toBe(400);
    expect(operacion.body.errors[0].extensions.codigo).toBe('VALIDACION');
    const vacio = await conToken({});
    expect(vacio.status).toBe(400);
    expect(vacio.body.errors[0].extensions.codigo).toBe('VALIDACION');
    // Sin pistas del esquema en el mensaje.
    const typo = await gql(['gerente'], '{ viajs { viajeId } }');
    expect(typo.body.errors[0].message).not.toMatch(/Did you mean/);

    rutas.set('GET /viajes/api/v1/viajes', () => ({ texto: '{roto' }));
    const lineas: string[] = [];
    const escribir = jest.spyOn(process.stderr, 'write').mockImplementation((t) => (lineas.push(String(t)), true));
    const interno = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${await token(['gerente'])}`)
      .set('X-Correlation-Id', '0193a000-0000-7000-8000-00000000c0de')
      .send({ query: '{ viajes { viajeId } }' });
    escribir.mockRestore();
    expect(interno.body.errors[0]).toMatchObject({ message: 'Error interno del Gateway', extensions: { codigo: 'ERROR_INTERNO' } });
    const linea = lineas.map((l) => JSON.parse(l)).find((l) => l.mensaje === 'Error interno en una operación GraphQL');
    expect(linea).toMatchObject({ nivel: 'ERROR', servicio: 'gateway', correlationId: '0193a000-0000-7000-8000-00000000c0de' });
    expect(linea.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(linea.error).toMatch(/JSON/);
  });

  it('401 como Problem Details con el type en guiones', async () => {
    const r = await request(app.getHttpServer()).post('/graphql').send({ query: '{ yo { sub } }' });
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.body.type).toBe('https://transporte.local/errores/no-autenticado');
  });

  it('D21: variantes del enlace (último carácter, sufijo, tercer segmento, exp no numérico, largo) → 403 problem+json', async () => {
    const { firmarDescarga } = await import('../src/graphql/resolvers');
    const exp = Math.floor(Date.now() / 1000) + 600;
    const bueno = firmarDescarga('hmac-de-prueba', 'e1', 'u1', exp);
    rutas.set('GET /analitica/api/v1/exportaciones/e1/archivo', () => ({ binario: Buffer.from('PK-excel') }));
    expect((await request(app.getHttpServer()).get(`/exportaciones/${bueno}`)).status).toBe(200);
    const [payload, firma] = bueno.split('.');
    // El último de los 43 caracteres solo lleva 4 bits de la firma: otro carácter con los mismos 4 bits decodifica a
    // los mismos bytes. Como se compara el texto, tampoco pasa.
    const ultimo = B64.indexOf(firma.at(-1)!);
    const gemelo = B64[(ultimo & ~3) + ((ultimo + 1) & 3)];
    const firmaDe = (p: string) => firmarDescarga('hmac-de-prueba', 'x', 'y', 1).replace(/^[^.]+/, p);
    const variantes = [
      `${payload}.${firma.slice(0, -1)}${gemelo}`,
      `${payload}.${firma.slice(0, -1)}${firma.at(-1) === 'A' ? 'B' : 'A'}`,
      `${bueno}=`,
      `${bueno}AA`,
      `${bueno}.extra`,
      firmarDescarga('hmac-de-prueba', 'e1', 'u1', 'mañana' as unknown as number),
      firmarDescarga('hmac-de-prueba', 'e1', 'u1', 'Infinity' as unknown as number),
      firmarDescarga('hmac-de-prueba', 'e1', 'u'.repeat(400), exp),
      firmaDe(payload),
    ];
    for (const v of variantes) {
      const r = await request(app.getHttpServer()).get(`/exportaciones/${v}`);
      expect([v, r.status]).toEqual([v, 403]);
      expect(r.headers['content-type']).toContain('application/problem+json');
      expect(r.body).toMatchObject({ codigo: 'SIN_PERMISO', type: 'https://transporte.local/errores/sin-permiso' });
    }
    const vencido = await request(app.getHttpServer()).get(`/exportaciones/${firmarDescarga('hmac-de-prueba', 'e1', 'u1', 1)}`);
    expect(vencido.status).toBe(404);
    expect(vencido.headers['content-type']).toContain('application/problem+json');
    expect(vencido.body.type).toBe('https://transporte.local/errores/exportacion-vencida');
  });

  it('tablero: saldos y conteos de todas las páginas, con la ventana de vencimientos que filtra Finanzas', async () => {
    const factura = (id: string, saldo: string, vencida: boolean, venceEl: string) => ({
      facturaId: id,
      saldo: { monto: saldo },
      vencida,
      venceEl,
    });
    rutas.set('GET /finanzas/api/v1/facturas', (_r, _c, url) => {
      if (url.searchParams.get('venceDesde'))
        return { json: { items: [factura('f9', '50.00', false, '2026-11-05')], siguienteCursor: null } };
      return url.searchParams.get('cursor') === 'p2'
        ? { json: { items: [factura('f3', '0.10', true, '2026-01-01')], siguienteCursor: null } }
        : {
            json: {
              items: [factura('f1', '100.00', false, '2026-12-01'), factura('f2', '200.20', true, '2026-01-01')],
              siguienteCursor: 'p2',
            },
          };
    });
    rutas.set('GET /flota/api/v1/unidades', (_r, _c, url) =>
      url.searchParams.get('cursor')
        ? { json: { items: [{ unidadId: 'u3', estado: 'DISPONIBLE' }], siguienteCursor: null } }
        : {
            json: {
              items: [
                { unidadId: 'u1', estado: 'EN_VIAJE' },
                { unidadId: 'u2', estado: 'DISPONIBLE' },
              ],
              siguienteCursor: 'c2',
            },
          },
    );
    const r = await gql(
      ['gerente'],
      '{ tablero(periodo: ESTA_SEMANA) { unidadesPorEstado { estado cantidad } cuentasPorCobrar { saldoTotal facturasPorVencer facturasVencidas proximas { facturaId } } alertasAbiertas datosAl } }',
    );
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.tablero).toEqual({
      unidadesPorEstado: [
        { estado: 'EN_VIAJE', cantidad: 1 },
        { estado: 'DISPONIBLE', cantidad: 2 },
      ],
      cuentasPorCobrar: { saldoTotal: '300.30', facturasPorVencer: 1, facturasVencidas: 2, proximas: [{ facturaId: 'f9' }] },
      alertasAbiertas: 2,
      datosAl: '2026-11-03T12:00:00Z',
    });
    const ventana = new URL(pedidos.find((p) => p.ruta.includes('venceDesde'))!.ruta, base).searchParams;
    expect(ventana.get('limite')).toBe('100');
    expect(ventana.get('conSaldo')).toBe('true');
    const { ventanaPorVencer } = await import('../src/graphql/resolvers');
    expect(ventana.get('venceDesde')).toBe(ventanaPorVencer('ESTA_SEMANA').venceDesde);
    expect(ventanaPorVencer('ESTA_SEMANA', '2026-11-03')).toEqual({ venceDesde: '2026-11-03', venceHasta: '2026-11-09' });
    expect(ventanaPorVencer('ESTE_MES', '2026-11-03')).toEqual({ venceDesde: '2026-11-03', venceHasta: '2026-11-30' });
    expect(ventanaPorVencer('HOY', '2026-11-03')).toEqual({ venceDesde: '2026-11-03', venceHasta: '2026-11-03' });
    // alertasAbiertas y datosAl salen de una sola llamada.
    expect(pedidos.filter((p) => p.ruta.startsWith('/analitica/api/v1/alertas'))).toHaveLength(1);
  });

  it('D97: hitos y entrega de una lista de viajes, como máximo 10 llamadas a la vez y sin limite hacia listarHitos', async () => {
    const viajes = Array.from({ length: 25 }, (_, i) => VIAJE(`v${i}`));
    rutas.set('GET /viajes/api/v1/viajes', () => ({ json: { items: viajes, siguienteCursor: null } }));
    let enCurso = 0;
    let maximo = 0;
    const hitos = [1, 2, 3].map((n) => ({ hitoId: `h${n}`, tipo: 'PARADA', descripcion: 'd', registradoEn: '2026-11-03T12:00:00Z' }));
    for (const v of viajes) {
      rutas.set(`GET /viajes/api/v1/viajes/${v.viajeId}/hitos`, () => {
        maximo = Math.max(maximo, ++enCurso);
        return { demoraMs: 30, alTerminar: () => enCurso--, json: { items: hitos } };
      });
    }
    const r = await gql(['gerente'], '{ viajes(limite: 25) { viajeId hitos(limite: 2) { hitoId } entrega { entregaId } } }');
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.viajes[0]).toEqual({ viajeId: 'v0', hitos: [{ hitoId: 'h1' }, { hitoId: 'h2' }], entrega: null });
    expect(maximo).toBeGreaterThan(1);
    expect(maximo).toBeLessThanOrEqual(10);
    expect(pedidos.filter((p) => p.ruta.includes('/hitos')).every((p) => !p.ruta.includes('limite'))).toBe(true);
  });

  it('mutación aplicada cuya relectura falla: sin error, el campo en null y un aviso en extensions', async () => {
    rutas.set('POST /viajes/api/v1/viajes/v1/intervencion', () => ({ status: 202 }));
    rutas.set('GET /viajes/api/v1/viajes/v1', () => ({ status: 503 }));
    const r = await gql(
      ['despachador'],
      'mutation { resolverIntervencion(viajeId: "v1", opcion: MARCAR_RESUELTO, claveIdempotencia: "k") { estado } }',
    );
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.resolverIntervencion).toBeNull();
    expect(r.body.extensions.avisos[0]).toMatchObject({
      codigo: 'DEPENDENCIA_NO_DISPONIBLE',
      servicio: 'viajes',
      path: ['resolverIntervencion'],
    });
    // Las que el contrato devuelve con el recurso no releen.
    rutas.set('POST /viajes/api/v1/viajes/v1/entrega/aprobacion', () => ({ json: { ...VIAJE('v1'), estado: 'ENTREGADO' } }));
    const a = await gql(['despachador'], 'mutation { aprobarEntregaObservada(viajeId: "v1", claveIdempotencia: "k2") { estado } }');
    expect(a.body.data.aprobarEntregaObservada).toEqual({ estado: 'ENTREGADO' });
    expect(pedidos.filter((p) => p.metodo === 'GET' && p.ruta === '/viajes/api/v1/viajes/v1')).toHaveLength(1);
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
