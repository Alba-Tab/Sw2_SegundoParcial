import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { TableroRepositorio } from '../data/tablero.repositorio';
import { TableroPagina } from './tablero';

function montar(roles: string[], respuesta: { data?: unknown; error?: unknown }) {
  const observar = vi.fn(() => of({ loading: false, ...respuesta }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-tablero', urls: { 'cc-operaciones': 'http://o' } } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(roles) } },
      { provide: TableroRepositorio, useValue: { observar } },
    ],
  });
  const f = TestBed.createComponent(TableroPagina);
  f.detectChanges();
  const texto = (f.nativeElement as HTMLElement).textContent ?? '';
  const enlaces = [...(f.nativeElement as HTMLElement).querySelectorAll('nav a')].map((a) => a.textContent?.trim());
  return { observar, texto, enlaces };
}

describe('Tablero por rol (spec 016, paso 10)', () => {
  it('el jefe de flota no ve ni pide cuentas por cobrar ni el riesgo, y no tiene el enlace al agente', () => {
    const { observar, texto, enlaces } = montar(['jefe_flota'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', viajesEnCurso: [], unidadesPorEstado: [], alertasAbiertas: 2, datosAl: null } },
    });
    expect(observar).toHaveBeenCalledWith(expect.objectContaining({ verCobranza: false, verRiesgo: false, verUnidades: true }), 30_000);
    expect(texto).not.toContain('Cuentas por cobrar');
    expect(texto).toContain('Unidades por estado');
    expect(enlaces).toEqual(['Reportes', 'Pregunta por voz']);
  });

  it('administracion no tiene tarjetas en blanco de viajes ni de unidades', () => {
    const { texto } = montar(['administracion'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', cuentasPorCobrar: null, alertasAbiertas: 0, datosAl: null } },
    });
    expect(texto).not.toContain('Viajes en curso');
    expect(texto).not.toContain('Unidades por estado');
    expect(texto).toContain('Cuentas por cobrar');
  });

  it('comercial no tiene enlaces a reportes, voz ni agente', () => {
    const { enlaces, texto } = montar(['comercial'], { data: { tablero: { periodo: 'ESTA_SEMANA', viajesEnCurso: [] } } });
    expect(enlaces).toEqual([]);
    expect(texto).not.toContain('Alertas abiertas');
    expect(texto).not.toContain('Datos al');
  });

  it('un SIN_PERMISO inesperado se ve como "Sin acceso" y un servicio caído como "no disponible"', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        { message: 'Sin permiso', path: ['tablero', 'unidadesPorEstado'], extensions: { codigo: 'SIN_PERMISO' } },
        { message: 'Analítica no responde', path: ['tablero', 'alertasAbiertas'], extensions: { codigo: 'DEPENDENCIA_NO_DISPONIBLE' } },
      ],
    });
    const { texto } = montar(['despachador'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', viajesEnCurso: [], unidadesPorEstado: null, alertasAbiertas: null } },
      error,
    });
    expect(texto).toContain('Sin acceso');
    expect(texto).toContain('Analítica no disponible');
  });
});
