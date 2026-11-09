import { ErrorDeDominio } from '../../src/dominio/comun/error-de-dominio';
import { Monto } from '../../src/dominio/comun/monto';
import { uuid7 } from '../../src/dominio/comun/uuid7';
import { rolesDelRealm } from '../../src/infraestructura/http/autenticacion.middleware';

describe('Monto', () => {
  it('redondea HALF_UP a 2 decimales sin usar number', () => {
    expect(Monto.bob('675.065').aContrato()).toEqual({ monto: '675.07', moneda: 'BOB' });
    expect(Monto.bob('3.74').por('180.5').aContrato().monto).toBe('675.07');
    expect(Monto.desdeContrato({ monto: '0.10', moneda: 'BOB' }).mas(Monto.bob('0.20')).aContrato().monto).toBe('0.30');
  });

  it('rechaza negativos, texto inválido y otra moneda', () => {
    expect(() => Monto.bob('-1')).toThrow(ErrorDeDominio);
    expect(() => Monto.bob('abc')).toThrow(ErrorDeDominio);
    expect(() => Monto.desdeContrato({ monto: '1.00', moneda: 'USD' })).toThrow('Moneda no soportada');
  });
});

describe('uuid7', () => {
  it('es versión 7, variante RFC y ordena por fecha', async () => {
    const a = uuid7();
    await new Promise((r) => setTimeout(r, 2));
    const b = uuid7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});

describe('rolesDelRealm', () => {
  it('lee realm_access.roles y tolera tokens sin roles', () => {
    expect(rolesDelRealm({ realm_access: { roles: ['jefe_flota', 'gerente'] } })).toEqual(['jefe_flota', 'gerente']);
    expect(rolesDelRealm({ sub: 'x' })).toEqual([]);
  });
});
