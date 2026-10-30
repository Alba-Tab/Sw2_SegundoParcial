import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { of, throwError } from 'rxjs';
import { esTransitorio, Intentos } from './clave';

const graphql = (codigo: string, status: number) =>
  new CombinedGraphQLErrors({ errors: [{ message: codigo, extensions: { codigo, status } }] });

describe('claves de idempotencia por intento', () => {
  it('solo red caída, 5xx o 409 IDEMPOTENCIA_EN_PROCESO son transitorios', () => {
    expect(esTransitorio(new TypeError('Failed to fetch'))).toBe(true);
    expect(esTransitorio(graphql('DEPENDENCIA_NO_DISPONIBLE', 503))).toBe(true);
    expect(esTransitorio(graphql('IDEMPOTENCIA_EN_PROCESO', 409))).toBe(true);
    expect(esTransitorio(new ServerError('Bad Gateway', { response: new Response('', { status: 502 }), bodyText: '' }))).toBe(true);
    expect(esTransitorio(graphql('PAGO_EXCEDE_SALDO', 422))).toBe(false);
    expect(esTransitorio(graphql('PAGO_DUPLICADO', 409))).toBe(false);
    expect(esTransitorio(graphql('CONFLICTO_ESTADO', 409))).toBe(false);
    expect(esTransitorio(new ServerError('Bad Request', { response: new Response('', { status: 400 }), bodyText: '' }))).toBe(false);
  });

  it('spec 008: tras un corte se reenvía la misma clave; tras un 422 y con el monto corregido, una clave nueva', async () => {
    const intentos = new Intentos();
    const claves: string[] = [];
    const pagar = (falla?: unknown) => (clave: string) => {
      claves.push(clave);
      return falla ? throwError(() => falla) : of({ data: { registrarPago: { estado: 'PAGADA' } } });
    };
    const datos = { facturaId: 'f1', monto: '3000.00', referencia: 'TRX-1' };

    await expect(intentos.enviar('registrarPago:f1', datos, pagar(new TypeError('Failed to fetch')))).rejects.toThrow();
    await expect(intentos.enviar('registrarPago:f1', datos, pagar(graphql('PAGO_EXCEDE_SALDO', 422)))).rejects.toThrow();
    expect(claves[1]).toBe(claves[0]); // mismo intento: Finanzas responde lo guardado y no duplica

    await expect(intentos.enviar('registrarPago:f1', datos, pagar())).resolves.toBeTruthy();
    expect(claves[2]).not.toBe(claves[1]); // después de una respuesta definitiva, intento nuevo

    await intentos.enviar('registrarPago:f1', { ...datos, monto: '2800.00' }, pagar());
    expect(claves[3]).not.toBe(claves[2]);
  });

  it('si cambian los datos después de un fallo transitorio, la clave también cambia', async () => {
    const intentos = new Intentos();
    const a = intentos.clave('cancelarServicio:s1', { motivo: 'cliente pidió' });
    intentos.terminar('cancelarServicio:s1', graphql('DEPENDENCIA_NO_DISPONIBLE', 503));
    expect(intentos.clave('cancelarServicio:s1', { motivo: 'cliente pidió' })).toBe(a);
    expect(intentos.clave('cancelarServicio:s1', { motivo: 'otro motivo' })).not.toBe(a);
  });
});
