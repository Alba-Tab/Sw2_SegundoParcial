import {
  type ArgumentsHost,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { generateKeyPair, SignJWT } from 'jose';
import mongoose, { mongo } from 'mongoose';
import { ErrorDeDominio } from '../../src/dominio/comun/error-de-dominio';
import { AutenticacionMiddleware } from '../../src/infraestructura/http/autenticacion.middleware';
import { CrearUnidadBody, ListarChoferesQueryParams } from '../../src/infraestructura/http/contrato/flota.zod';
import { FiltroProblemas } from '../../src/infraestructura/http/filtro-problemas';
import { hashPeticion } from '../../src/infraestructura/http/hash-cuerpo';
import { claveObligatoria, conBooleanos, validar } from '../../src/infraestructura/http/validar';
import { esperaParaReencolar } from '../../src/infraestructura/mensajeria/consumidor-eventos';
import { traceparentValido } from '../../src/infraestructura/observabilidad/contexto';

interface RespuestaFalsa {
  estado: number;
  tipo: string;
  cuerpo: Record<string, unknown>;
  encabezados: Record<string, string>;
}

/** Aplica el filtro a un error y devuelve lo que habría escrito en la respuesta. */
function responder(error: unknown): RespuestaFalsa {
  const r: RespuestaFalsa = { estado: 0, tipo: '', cuerpo: {}, encabezados: {} };
  const res = {
    getHeader: (n: string) => r.encabezados[n.toLowerCase()],
    setHeader: (n: string, v: string) => (r.encabezados[n.toLowerCase()] = v),
    status: (s: number) => ((r.estado = s), res),
    type: (t: string) => ((r.tipo = t), res),
    json: (b: Record<string, unknown>) => ((r.cuerpo = b), res),
  };
  new FiltroProblemas().catch(error, { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost);
  return r;
}

/** Un error de body-parser (http-errors): status 4xx, expose y type. */
const errorDeBodyParser = (status: number, mensaje: string, type: string) =>
  Object.assign(new Error(mensaje), { status, statusCode: status, expose: true, type });

describe('FiltroProblemas (000 §5)', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('errores solo en un 400 de validación; en un 422 el campo no va como errores', () => {
    const v = responder(new ErrorDeDominio('VALIDACION', 'monto: debe ser mayor que 0', { campo: 'monto' }));
    expect(v.estado).toBe(400);
    expect(v.cuerpo.errores).toEqual([{ campo: 'monto', mensaje: 'debe ser mayor que 0' }]);
    const k = responder(new ErrorDeDominio('KILOMETRAJE_INVALIDO', 'El odómetro no puede bajar de 184000 km', { campo: 'kilometraje' }));
    expect(k.estado).toBe(422);
    expect(k.cuerpo).toMatchObject({ codigo: 'KILOMETRAJE_INVALIDO', detail: 'El odómetro no puede bajar de 184000 km' });
    expect(k.cuerpo.errores).toBeUndefined();
    const c = responder(new ErrorDeDominio('CONFLICTO_ESTADO', 'No se puede', { estadoActual: 'EN_VIAJE' }));
    expect(c.cuerpo).toMatchObject({ status: 409, estadoActual: 'EN_VIAJE' });
  });

  it('title es texto para personas según el estado, no el código (000 §5)', () => {
    expect(responder(new ErrorDeDominio('PLACA_DUPLICADA', 'La placa ya existe')).cuerpo).toMatchObject({
      status: 409,
      codigo: 'PLACA_DUPLICADA',
      title: 'Conflicto con el estado actual',
    });
    expect(responder(new ErrorDeDominio('KILOMETRAJE_INVALIDO', 'El odómetro no puede bajar')).cuerpo.title).toBe(
      'Regla de negocio no cumplida',
    );
    expect(responder(new ErrorDeDominio('VALIDACION', 'monto: x', { campo: 'monto' })).cuerpo.title).toBe('Petición inválida');
    expect(responder(new ErrorDeDominio('NO_ENCONTRADO', 'La unidad no existe')).cuerpo.title).toBe('No encontrado');
    expect(responder(new ErrorDeDominio('DEPENDENCIA_NO_DISPONIBLE', 'x')).cuerpo.title).toBe('Dependencia no disponible');
    expect(responder(new ConflictException()).cuerpo.title).toBe('Conflicto con el estado actual');
    expect(responder(errorDeBodyParser(413, 'request entity too large', 'entity.too.large')).cuerpo.title).toBe('Cuerpo demasiado grande');
  });

  it('respeta el estado de body-parser: cuerpo grande 413, JSON inválido 400, tipo no soportado 415', () => {
    const grande = responder(errorDeBodyParser(413, 'request entity too large', 'entity.too.large'));
    expect([grande.estado, grande.cuerpo.codigo, grande.tipo]).toEqual([413, 'VALIDACION', 'application/problem+json']);
    expect(responder(errorDeBodyParser(415, 'unsupported charset "UTF-7"', 'charset.unsupported')).estado).toBe(415);
    expect(responder(errorDeBodyParser(400, 'request aborted', 'request.aborted')).cuerpo.codigo).toBe('VALIDACION');
  });

  it('HttpException fuera de 400-404: 409 CONFLICTO_ESTADO, 413 y 415 VALIDACION, 429 y 503 con su código', () => {
    expect(responder(new ConflictException()).cuerpo.codigo).toBe('CONFLICTO_ESTADO');
    expect(responder(new HttpException('grande', 413)).cuerpo).toMatchObject({ status: 413, codigo: 'VALIDACION' });
    expect(responder(new HttpException('tipo', 415)).cuerpo).toMatchObject({ status: 415, codigo: 'VALIDACION' });
    expect(responder(new HttpException('lento', 429)).cuerpo).toMatchObject({ status: 429, codigo: 'LIMITE_PETICIONES' });
    expect(responder(new NotFoundException('Cannot GET /x')).cuerpo).toMatchObject({ status: 404, codigo: 'NO_ENCONTRADO' });
    const caido = responder(new ServiceUnavailableException('Keycloak no responde'));
    expect([caido.estado, caido.cuerpo.codigo, caido.encabezados['retry-after']]).toEqual([503, 'DEPENDENCIA_NO_DISPONIBLE', '30']);
  });

  it('Mongo caído es 503 DEPENDENCIA_NO_DISPONIBLE con Retry-After (spec 009), sin el mensaje del driver', () => {
    const errores = [
      new mongo.MongoNetworkError('connection 1 to 127.0.0.1:27017 closed'),
      new mongo.MongoNotConnectedError('Client must be connected'),
      new mongo.MongoTopologyClosedError(),
      Object.assign(new Error('Server selection timed out after 5000 ms'), { name: 'MongoServerSelectionError' }),
      new mongoose.Error('Operation `unidades.findOne()` buffering timed out after 10000ms'),
    ];
    for (const e of errores) {
      const r = responder(e);
      expect([r.estado, r.cuerpo.codigo, r.encabezados['retry-after']]).toEqual([503, 'DEPENDENCIA_NO_DISPONIBLE', '30']);
      expect(JSON.stringify(r.cuerpo)).not.toMatch(/27017|buffering|selection/i);
    }
    // Un 503 de negocio también lleva Retry-After.
    expect(responder(new ErrorDeDominio('DEPENDENCIA_NO_DISPONIBLE', 'x')).encabezados['retry-after']).toBe('30');
  });

  it('un error inesperado es 500, va al log y no expone la traza', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const r = responder(new Error('Cannot read properties of undefined (reading x)'));
    expect(r.estado).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain('Cannot read');
    expect(r.encabezados['retry-after']).toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Cannot read'));
    errorLog.mockRestore();
  });
});

describe('AutenticacionMiddleware', () => {
  const issuer = 'http://127.0.0.1:1/realms/transporte'; // nadie escucha: no se pueden bajar las llaves
  let anterior: string | undefined;
  beforeAll(() => {
    anterior = process.env.OIDC_ISSUER;
    process.env.OIDC_ISSUER = issuer;
  });
  afterAll(() => {
    process.env.OIDC_ISSUER = anterior;
  });
  const peticion = (token: string) => ({ header: (n: string) => (n === 'authorization' ? `Bearer ${token}` : undefined) });

  it('si Keycloak no entrega las llaves responde 503 con Retry-After, no 401', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const token = await new SignJWT({ realm_access: { roles: ['jefe_flota'] } })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience('flota')
      .setSubject('sub-1')
      .setExpirationTime('5m')
      .sign(privateKey);
    const res = { setHeader: jest.fn() };
    const mw = new AutenticacionMiddleware();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(mw.use(peticion(token) as never, res as never, jest.fn())).rejects.toMatchObject({ codigo: 'DEPENDENCIA_NO_DISPONIBLE' });
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('un token mal formado sigue siendo 401', async () => {
    const mw = new AutenticacionMiddleware();
    await expect(mw.use(peticion('no.es.jwt') as never, { setHeader: jest.fn() } as never, jest.fn())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('Idempotencia y parámetros (000 §4)', () => {
  const req = (method: string, originalUrl: string, sub: string) => ({ method, originalUrl, usuario: { sub, roles: ['jefe_flota'] } });

  it('el hash incluye el método, la ruta con sus ids y el sub; no la consulta ni el orden de los campos', () => {
    const base = hashPeticion(req('POST', '/api/v1/unidades/a/baja', 'jefe-1'), { motivo: 'Vendida', x: 1 });
    expect(hashPeticion(req('POST', '/api/v1/unidades/a/baja?x=1', 'jefe-1'), { x: 1, motivo: 'Vendida' })).toBe(base);
    expect(hashPeticion(req('POST', '/api/v1/unidades/b/baja', 'jefe-1'), { motivo: 'Vendida', x: 1 })).not.toBe(base);
    expect(hashPeticion(req('POST', '/api/v1/unidades/a/baja', 'jefe-2'), { motivo: 'Vendida', x: 1 })).not.toBe(base);
    expect(hashPeticion(req('PUT', '/api/v1/unidades/a/baja', 'jefe-1'), { motivo: 'Vendida', x: 1 })).not.toBe(base);
  });

  it('un campo __proto__ en cualquier nivel es 400 con su ruta, aunque zod lo descartaría (D76)', () => {
    const alta = (atributos: string) =>
      JSON.parse(
        `{"tipoUnidad":"REMOLQUE","placa":"8004FUR","tipoRemolque":"FURGON","capacidadToneladas":30,` +
          `"kmDesdeUltimoMantenimiento":0,"documentos":[{"tipo":"SOAT","venceEl":"2030-01-01"},` +
          `{"tipo":"INSPECCION_TECNICA","venceEl":"2030-01-01"}],"atributos":${atributos}}`,
      ) as unknown;
    // Sin la revisión, zod devuelve atributos sin la clave y el dominio no la ve.
    expect(Object.keys(CrearUnidadBody.parse(alta('{"volumenM3":85,"__proto__":1}')).atributos)).toEqual(['volumenM3']);
    const error = (cuerpo: unknown) => {
      try {
        validar(CrearUnidadBody, cuerpo);
      } catch (e) {
        return e instanceof ErrorDeDominio ? `${e.codigo} ${String(e.datos?.campo)}` : String(e);
      }
      return 'sin error';
    };
    expect(error(alta('{"volumenM3":85,"__proto__":1}'))).toBe('VALIDACION atributos.__proto__');
    expect(error(alta('{"volumenM3":85,"__proto__":{"x":1}}'))).toBe('VALIDACION atributos.__proto__');
    expect(error(JSON.parse('{"__proto__":{"motivo":"x"}}'))).toBe('VALIDACION __proto__');
    expect(error(alta('{"volumenM3":85}'))).toBe('sin error');
  });

  it('Idempotency-Key obligatoria y UUID', () => {
    expect(claveObligatoria('0193A000-0000-7000-8000-000000000001')).toBe('0193A000-0000-7000-8000-000000000001');
    for (const clave of [undefined, '', 'abc', '0193a000-0000-7000-8000-00000000000']) {
      expect(() => claveObligatoria(clave)).toThrow(expect.objectContaining({ codigo: 'VALIDACION', datos: { campo: 'Idempotency-Key' } }));
    }
  });

  it('activo=true|false llega como texto y se valida como booleano; otro valor es 400', () => {
    const p = (q: Record<string, string>) => ListarChoferesQueryParams.safeParse(conBooleanos(q, ['activo']));
    expect(p({ activo: 'false' }).data?.activo).toBe(false);
    expect(p({ activo: 'true', limite: '5' }).data).toMatchObject({ activo: true, limite: 5 });
    expect(p({}).data?.activo).toBeUndefined();
    expect(p({ activo: 'si' }).success).toBe(false);
  });
});

describe('Mensajería', () => {
  it('reencola con espera creciente según las entregas, con tope', () => {
    expect([0, 1, 2, 3, 4, 10].map(esperaParaReencolar)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });

  it('solo propaga un traceparent W3C válido', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    expect(traceparentValido(tp)).toBe(tp);
    expect(traceparentValido('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeUndefined();
    expect(traceparentValido('basura')).toBeUndefined();
    expect(traceparentValido(undefined)).toBeUndefined();
  });
});
