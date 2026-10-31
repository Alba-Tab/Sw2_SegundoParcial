import { conLaElegidaPrimero } from '../../acciones/domain/accion';
import { estadoConAlerta } from '../../viajes/domain/viaje';
import { motivoCancelacionValido, nombreCliente } from './servicio';

describe('cc-operaciones (dominio)', () => {
  it('spec 004: el motivo de la cancelación va de 3 a 300 caracteres', () => {
    expect(motivoCancelacionValido('ab')).toBe(false);
    expect(motivoCancelacionValido('  cliente pidió  ')).toBe(true);
    expect(motivoCancelacionValido('x'.repeat(301))).toBe(false);
    expect(motivoCancelacionValido(undefined)).toBe(false);
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

  it('los estados que piden decisión se pintan como alerta', () => {
    expect(estadoConAlerta('ENTREGA_OBSERVADA')).toBe(true);
    expect(estadoConAlerta('EN_RUTA')).toBe(false);
    expect(estadoConAlerta(undefined)).toBe(false);
  });
});
