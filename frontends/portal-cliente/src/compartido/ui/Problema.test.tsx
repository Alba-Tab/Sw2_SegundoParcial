import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../../api/cliente';
import { mensajeDe, Problema } from './Problema';

const conCodigo = (codigo: string | undefined, estado = 500) =>
  new ErrorApi(estado, { type: 'x', title: 't', status: estado, detail: 'NullPointerException at Servicio.java:42', codigo } as never);

describe('Problema (000 §5)', () => {
  it('dice la frase del código y nunca el detail técnico ni el estado HTTP', () => {
    expect(mensajeDe(conCodigo('CREDITO_INSUFICIENTE', 422))).toBe('Tu crédito disponible no alcanza para este servicio.');
    expect(mensajeDe(conCodigo('CODIGO_NUEVO'))).toBe('No se pudo completar. Intenta de nuevo.');
    expect(mensajeDe(conCodigo(undefined, 502))).not.toMatch(/502|Exception/);
    expect(mensajeDe(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/);
  });

  it('ofrece Reintentar cuando la página puede volver a pedir', () => {
    const reintentar = vi.fn();
    render(<Problema error={conCodigo('DEPENDENCIA_NO_DISPONIBLE', 503)} reintentar={reintentar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reintentar).toHaveBeenCalledOnce();
  });
});
