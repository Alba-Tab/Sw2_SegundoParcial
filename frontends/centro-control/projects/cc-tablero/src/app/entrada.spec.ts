import { debeRedirigir } from './entrada';

describe('entrada a cc-tablero', () => {
  const base = { url: '/', destino: 'cc-operaciones' as const, yaEntro: false, vieneDeOtraApp: false };

  it('spec 016, paso 2: la primera entrada lleva al despachador a cc-operaciones', () => {
    expect(debeRedirigir(base)).toBe(true);
  });

  it('después de la primera entrada, quien vuelve al tablero desde la barra se queda', () => {
    expect(debeRedirigir({ ...base, yaEntro: true })).toBe(false);
    expect(debeRedirigir({ ...base, vieneDeOtraApp: true })).toBe(false);
  });

  it('/voz y /reportes nunca redirigen, y el gerente se queda', () => {
    expect(debeRedirigir({ ...base, url: '/voz' })).toBe(false);
    expect(debeRedirigir({ ...base, url: '/reportes' })).toBe(false);
    expect(debeRedirigir({ ...base, destino: 'cc-tablero' })).toBe(false);
    expect(debeRedirigir({ ...base, destino: undefined })).toBe(false);
  });
});
