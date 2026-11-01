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

  it('muestra la razón social de la copia de clientes, o el id si no está', () => {
    expect(nombreCliente([{ clienteId: 'c1', razonSocial: 'Soya SA' }, null], 'c1')).toBe('Soya SA');
    expect(nombreCliente(undefined, 'c2')).toBe('c2');
  });

  it('la acción abierta desde una alerta va primero', () => {
    const lista = [{ accionId: 'a' }, { accionId: 'b' }, { accionId: 'c' }];
    expect(conLaElegidaPrimero(lista, 'c').map((a) => a.accionId)).toEqual(['c', 'a', 'b']);
    expect(conLaElegidaPrimero(lista, undefined)).toBe(lista);
  });
});
