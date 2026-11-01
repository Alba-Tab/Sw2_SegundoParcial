import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { ViajesRepositorio } from '../data/viajes.repositorio';
import { ViajePagina } from './viaje';

const viaje = { viajeId: 'v1', placa: '4521KTR', estado: 'EN_RUTA', hitos: [] };

function montar(respuesta: { data?: unknown; error?: unknown }): string {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-operaciones', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(['gerente']), tiene: () => false } },
      { provide: ViajesRepositorio, useValue: { observarViaje: () => ({ valueChanges: of({ loading: false, ...respuesta }) }) } },
    ],
  });
  const f = TestBed.createComponent(ViajePagina);
  f.componentRef.setInput('id', 'v1');
  f.detectChanges();
  TestBed.tick();
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent ?? '';
}

const errorEn = (codigo: string) =>
  new CombinedGraphQLErrors({
    data: { viaje: { ...viaje, riesgo: null } },
    errors: [{ message: 'x', path: ['viaje', 'riesgo'], extensions: { codigo } }],
  });

describe('riesgo de retraso en el detalle del viaje (W3, B-1)', () => {
  it('sin predicción (el Gateway deja null por el 404) dice que aún no hay datos', () => {
    expect(montar({ data: { viaje: { ...viaje, riesgo: null } } })).toContain('Aún no hay datos para estimar el retraso');
  });

  it('con error en riesgo dice "Riesgo no disponible", nunca "aún no hay datos"', () => {
    const texto = montar({ data: { viaje: { ...viaje, riesgo: null } }, error: errorEn('ERROR_INTERNO') });
    expect(texto).toContain('Riesgo no disponible');
    expect(texto).not.toContain('Aún no hay datos');
  });

  it('con Analítica caída lo dice una sola vez, en la sección; sin banner (V1-10)', () => {
    const texto = montar({ data: { viaje: { ...viaje, riesgo: null } }, error: errorEn('DEPENDENCIA_NO_DISPONIBLE') });
    expect(texto).toContain('Riesgo no disponible');
    expect(texto).not.toContain('Analítica no disponible');
    expect(texto).not.toContain('Viajes no disponible');
  });

  it('con la predicción muestra la probabilidad', () => {
    const riesgo = { probabilidad: 0.8, umbral: 0.7, enRiesgo: true, factores: [], calculadaEn: '2026-10-31T12:00:00Z' };
    expect(montar({ data: { viaje: { ...viaje, riesgo } } })).toContain('Riesgo de retraso: 80');
  });
});
