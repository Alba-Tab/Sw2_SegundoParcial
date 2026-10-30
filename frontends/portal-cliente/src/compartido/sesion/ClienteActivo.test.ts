import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { leerClienteActivo } from './ClienteActivo';

const CLIENTE = '0193a000-0000-7000-8000-0000000c0009';

describe('cliente activo de "Ver como cliente" (FK2)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('el ?clienteId= sobrevive a la vuelta de Keycloak, que recarga la página sin ese parámetro', () => {
    window.history.replaceState({}, '', `/?clienteId=${CLIENTE}`);
    expect(leerClienteActivo()).toEqual({ clienteId: CLIENTE });
    window.history.replaceState({}, '', '/?code=abc&state=xyz');
    expect(leerClienteActivo()).toEqual({ clienteId: CLIENTE });
  });

  it('el parámetro manda sobre lo elegido antes en la pestaña; si es el mismo, conserva la razón social', () => {
    sessionStorage.setItem('portal-cliente-activo', JSON.stringify({ clienteId: 'otro', razonSocial: 'Otro S.A.' }));
    window.history.replaceState({}, '', `/cotizar?clienteId=${CLIENTE}`);
    expect(leerClienteActivo()).toEqual({ clienteId: CLIENTE });

    sessionStorage.setItem('portal-cliente-activo', JSON.stringify({ clienteId: CLIENTE, razonSocial: 'Soya del Oriente S.R.L.' }));
    expect(leerClienteActivo()).toEqual({ clienteId: CLIENTE, razonSocial: 'Soya del Oriente S.R.L.' });
  });

  it('sin parámetro ni elección, ningún cliente', () => {
    expect(leerClienteActivo()).toEqual({});
  });
});
