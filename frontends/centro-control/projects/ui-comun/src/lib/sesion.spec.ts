import { ErrorResponse, ErrorTimeout } from 'oidc-client-ts';
import { limitador, MINIMO_ENTRE_RENOVACIONES_MS, sesionTerminada } from './sesion';

describe('Sesion', () => {
  it('solo invalid_grant y login_required cierran la sesión; red o Keycloak caídos no', () => {
    expect(sesionTerminada(new ErrorResponse({ error: 'invalid_grant' }))).toBe(true);
    expect(sesionTerminada(new ErrorResponse({ error: 'login_required' }))).toBe(true);
    expect(sesionTerminada(new ErrorResponse({ error: 'temporarily_unavailable' }))).toBe(false);
    expect(sesionTerminada(new TypeError('Failed to fetch'))).toBe(false);
    expect(sesionTerminada(new ErrorTimeout('Network timed out'))).toBe(false);
    expect(sesionTerminada(new Error('Invalid response Content-Type: text/html'))).toBe(false);
    expect(sesionTerminada(undefined)).toBe(false);
  });

  it('FK3: al volver a la pestaña renueva siempre, como máximo una vez cada 10 s', () => {
    let ahora = 0;
    const puede = limitador(MINIMO_ENTRE_RENOVACIONES_MS, () => ahora);
    expect(puede()).toBe(true);
    ahora = 9_999;
    expect(puede()).toBe(false);
    ahora = 10_000;
    expect(puede()).toBe(true);
    ahora = 10_500;
    expect(puede()).toBe(false);
  });
});
