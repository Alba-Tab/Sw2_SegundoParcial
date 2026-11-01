import { cambioDeSaldo } from './filtro';

describe('filtro de facturas (V1-8)', () => {
  it('al pasar a "Con saldo" limpia un estado que ya no se ofrece', () => {
    expect(cambioDeSaldo('con-saldo', 'PAGADA')).toEqual({ saldo: null, estado: null });
    expect(cambioDeSaldo('con-saldo', 'EMITIDA')).toEqual({ saldo: null });
    expect(cambioDeSaldo('con-saldo', null)).toEqual({ saldo: null });
  });

  it('al pasar a "Todas" conserva el estado', () => {
    expect(cambioDeSaldo('todas', 'PAGADA_PARCIAL')).toEqual({ saldo: 'todas' });
  });
});
