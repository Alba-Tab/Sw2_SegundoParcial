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
      {
        provide: CONFIG_CENTRO,
        useValue: {
          app: 'cc-tablero',
          urls: { 'cc-operaciones': 'http://o', 'cc-flota': 'http://f', 'cc-finanzas': 'http://fi' },
        } as unknown as ConfigCentro,
      },
      { provide: Sesion, useValue: { roles: signal(roles), tiene: (...r: string[]) => roles.some((x) => r.includes(x)) } },
      { provide: TableroRepositorio, useValue: { observar } },
    ],
  });
  const f = TestBed.createComponent(TableroPagina);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  return { observar, texto: el.textContent ?? '', el };
}

describe('Tablero por rol (spec 016, paso 10)', () => {
  it('el jefe de flota no ve ni pide cuentas por cobrar ni el riesgo', () => {
    const { observar, texto } = montar(['jefe_flota'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', viajesEnCurso: [], unidadesPorEstado: [], alertasAbiertas: 2, datosAl: null } },
    });
    expect(observar).toHaveBeenCalledWith(expect.objectContaining({ verCobranza: false, verRiesgo: false, verUnidades: true }), 30_000);
    expect(texto).not.toContain('Cuentas por cobrar');
    expect(texto).toContain('Unidades por estado');
  });

  it('administracion no tiene tarjetas en blanco de viajes ni de unidades', () => {
    const { texto } = montar(['administracion'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', cuentasPorCobrar: null, alertasAbiertas: 0, datosAl: null } },
    });
    expect(texto).not.toContain('Viajes en curso');
    expect(texto).not.toContain('Unidades por estado');
    expect(texto).toContain('Cuentas por cobrar');
  });

  it('FB-7: «Datos al …» viejo dice que las cifras pueden no estar al día; reciente, solo la hora', () => {
    const viejo = montar(['gerente'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', alertasAbiertas: 0, datosAl: '2026-10-31T22:01:00Z' } },
    });
    expect(viejo.texto).toContain('Datos al 31/10 18:01');
    expect(viejo.texto).toContain('las cifras pueden no estar al día');
    expect(viejo.el.querySelector('.datos-al.viejo mat-icon')?.textContent).toBe('warning');
    TestBed.resetTestingModule();
    const reciente = montar(['gerente'], {
      data: { tablero: { periodo: 'ESTA_SEMANA', alertasAbiertas: 0, datosAl: new Date().toISOString() } },
    });
    expect(reciente.texto).toContain('Datos al');
    expect(reciente.texto).not.toContain('no estar al día');
  });

  it('comercial no ve alertas ni la fecha de los datos', () => {
    const { texto } = montar(['comercial'], { data: { tablero: { periodo: 'ESTA_SEMANA', viajesEnCurso: [] } } });
    expect(texto).not.toContain('Alertas abiertas');
    expect(texto).not.toContain('Datos al');
    expect(texto).not.toContain('Nada pide acción');
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

  it('lo que pide acción va primero y enlaza a la app que lo resuelve con ?desde=cc-tablero (U7, N3)', () => {
    const { el } = montar(['gerente'], {
      data: {
        tablero: {
          periodo: 'ESTA_SEMANA',
          viajesEnCurso: [{ viajeId: 'v1', placa: 'AAA-1', riesgo: { enRiesgo: true, probabilidad: 0.7 } }],
          unidadesPorEstado: [{ estado: 'MANTENIMIENTO_PENDIENTE', cantidad: 2 }],
          cuentasPorCobrar: { saldoTotal: '100.00', facturasPorVencer: 0, facturasVencidas: 1, proximas: [] },
          alertasAbiertas: 0,
          datosAl: null,
        },
      },
    });
    const h2 = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(h2.indexOf('Pide acción')).toBeLessThan(h2.indexOf('Cifras del periodo'));
    const enlaces = [...el.querySelectorAll('.pendientes a')].map((a) => a.getAttribute('href'));
    expect(enlaces).toEqual([
      'http://o/viajes/v1?desde=cc-tablero',
      'http://fi/cobranza?desde=cc-tablero',
      'http://f/unidades?estado=MANTENIMIENTO_PENDIENTE&desde=cc-tablero',
    ]);
  });

  it('sin pendientes lo dice, en vez de dejar la sección vacía', () => {
    const { texto } = montar(['administracion'], {
      data: {
        tablero: {
          periodo: 'ESTA_SEMANA',
          cuentasPorCobrar: { saldoTotal: '0.00', facturasPorVencer: 0, facturasVencidas: 0, proximas: [] },
          alertasAbiertas: 0,
          datosAl: null,
        },
      },
    });
    expect(texto).toContain('Nada pide acción ahora.');
  });
});
