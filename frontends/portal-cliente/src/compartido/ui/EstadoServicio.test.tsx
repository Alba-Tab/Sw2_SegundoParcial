import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EstadoServicio } from './EstadoServicio';

describe('EstadoServicio', () => {
  it('muestra "En aprobación" mientras la saga espera la decisión de crédito', () => {
    render(<EstadoServicio estado="PROGRAMANDO" etapa="ESPERANDO_APROBACION" />);
    expect(screen.getByText('En aprobación')).toBeTruthy();
  });

  it('traduce el estado del viaje', () => {
    render(<EstadoServicio estado="EN_RUTA" />);
    expect(screen.getByText('En ruta')).toBeTruthy();
  });
});
