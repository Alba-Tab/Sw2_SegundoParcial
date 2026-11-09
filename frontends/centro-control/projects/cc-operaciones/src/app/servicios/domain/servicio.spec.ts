import { conLaElegidaPrimero } from '../../acciones/domain/accion';
import { estadoServicio, nombreCliente, puedeCancelarServicio } from './servicio';

describe('cc-operaciones (dominio)', () => {
  it('spec 004: solo se cancela un servicio confirmado con la saga terminada', () => {
    expect(puedeCancelarServicio({ estado: 'CONFIRMADO', confirmacionCompleta: true })).toBe(true);
    expect(puedeCancelarServicio({ estado: 'CONFIRMADO', confirmacionCompleta: false })).toBe(false);
    expect(puedeCancelarServicio({ estado: 'EN_RUTA', confirmacionCompleta: true })).toBe(false);
  });

  it('del filtro de la URL solo pasa a Viajes un estado del enum', () => {
    expect(estadoServicio('EN_RUTA')).toBe('EN_RUTA');
    expect(estadoServicio('INVENTADO')).toBeNull();
    expect(estadoServicio(null)).toBeNull();
  });

  it('muestra la razón social del servicio; si Viajes no la dio, "Sin dato" sin mostrar el id', () => {
    expect(nombreCliente({ razonSocial: 'Soya SA' })).toBe('Soya SA');
    expect(nombreCliente({ razonSocial: null })).toBe('Sin dato');
  });

  it('la acción abierta desde una alerta va primero', () => {
    const lista = [{ accionId: 'a' }, { accionId: 'b' }, { accionId: 'c' }];
    expect(conLaElegidaPrimero(lista, 'c').map((a) => a.accionId)).toEqual(['c', 'a', 'b']);
    expect(conLaElegidaPrimero(lista, undefined)).toBe(lista);
  });
});
