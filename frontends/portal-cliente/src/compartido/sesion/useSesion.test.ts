import { ErrorResponse } from 'oidc-client-ts';
import { afterEach, describe, expect, it } from 'vitest';
import { destinoActual, destinoSeguro, reclamosDe, sesionPerdida } from './useSesion';

const token = (payload: object) => `e30.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.firma`;

describe('reclamosDe', () => {
  it('lee clienteId y los roles del access token (con tildes en el nombre)', () => {
    const r = reclamosDe(token({ sub: 's', name: 'Ñandú', clienteId: 'c1', realm_access: { roles: ['cliente'] } }).replace(/^e30/, 'e30'));
    expect(r.clienteId).toBe('c1');
    expect(r.realm_access?.roles).toEqual(['cliente']);
  });

  it('un token ilegible no rompe la sesión', () => {
    expect(reclamosDe('no-es-un-jwt')).toEqual({});
    expect(reclamosDe(undefined)).toEqual({});
  });
});

describe('volver a la página pedida después de Keycloak', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('el state lleva la ruta y la búsqueda actuales (enlace del correo, "Ver como cliente")', () => {
    window.history.replaceState({}, '', '/servicios/0193a000-0000-7000-8000-000000000123');
    expect(destinoActual()).toBe('/servicios/0193a000-0000-7000-8000-000000000123');
    window.history.replaceState({}, '', '/?clienteId=0193a000-0000-7000-8000-0000000c0009');
    expect(destinoActual()).toBe('/?clienteId=0193a000-0000-7000-8000-0000000c0009');
  });

  it('en la vuelta misma de Keycloak (con code y state) no guarda el código como destino', () => {
    window.history.replaceState({}, '', '/?code=abc&state=xyz&session_state=s');
    expect(destinoActual()).toBe('/');
  });

  it('solo acepta rutas de este origen', () => {
    expect(destinoSeguro('/facturas/f1')).toBe('/facturas/f1');
    expect(destinoSeguro('//otro.sitio/robar')).toBe('/');
    expect(destinoSeguro('/\\otro.sitio')).toBe('/');
    expect(destinoSeguro('https://otro.sitio')).toBe('/');
    expect(destinoSeguro(undefined)).toBe('/');
    expect(destinoSeguro({ a: 1 })).toBe('/');
  });
});

describe('sesionPerdida', () => {
  it('invalid_grant de Keycloak sí; un corte de red o un tiempo agotado no', () => {
    expect(sesionPerdida(new ErrorResponse({ error: 'invalid_grant', error_description: 'Session not active' }))).toBe(true);
    expect(sesionPerdida(new ErrorResponse({ error: 'temporarily_unavailable' }))).toBe(false);
    expect(sesionPerdida(new TypeError('Failed to fetch'))).toBe(false);
  });
});
