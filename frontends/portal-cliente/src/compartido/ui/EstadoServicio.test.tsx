import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EstadoFactura, EstadoServicio } from './EstadoServicio';

describe('EstadoServicio', () => {
  it('muestra "En aprobación" mientras la saga espera la decisión de crédito', () => {
    render(<EstadoServicio estado="PROGRAMANDO" etapa="ESPERANDO_APROBACION" />);
    expect(screen.getByText('En aprobación')).toBeTruthy();
  });

  it('traduce el estado del viaje', () => {
    render(<EstadoServicio estado="EN_RUTA" />);
    expect(screen.getByText('En ruta')).toBeTruthy();
  });

  it('acompaña el texto con un icono decorativo', () => {
    const { container } = render(<EstadoFactura estado="PAGADA_PARCIAL" />);
    expect(screen.getByText('Pago parcial')).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
