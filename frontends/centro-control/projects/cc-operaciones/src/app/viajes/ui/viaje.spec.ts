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

describe('marcar resuelta una intervención (spec 011; R2F-2)', () => {
  it('pide confirmar con un resumen antes de cancelar el viaje y solo envía al confirmar', async () => {
    const resolverIntervencion = vi.fn(() => of({ data: {} }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CONFIG_CENTRO, useValue: { app: 'cc-operaciones', urls: {} } as unknown as ConfigCentro },
        { provide: Sesion, useValue: { roles: signal(['despachador']), tiene: (...r: string[]) => r.includes('despachador') } },
        {
          provide: ViajesRepositorio,
          useValue: {
            observarViaje: () => ({
              valueChanges: of({ loading: false, data: { viaje: { ...viaje, estado: 'REQUIERE_INTERVENCION' } } }),
              refetch: () => Promise.resolve(),
            }),
            resolverIntervencion,
          },
        },
      ],
    });
    const f = TestBed.createComponent(ViajePagina);
    f.componentRef.setInput('id', 'v1');
    f.detectChanges();
    TestBed.tick();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const boton = (texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;
    f.componentInstance.texto.setValue('Liberado a mano en Finanzas');
    boton('Marcar resuelto').click();
    f.detectChanges();
    expect(resolverIntervencion).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      'Se marca resuelto el viaje 4521KTR con la nota «Liberado a mano en Finanzas»: el viaje queda cancelado y las reservas se liberan solas cuando vuelva su servicio. No se puede deshacer.',
    );
    expect(f.componentInstance.texto.disabled).toBe(true);
    boton('Sí, marcar resuelto').click();
    await f.whenStable();
    expect(resolverIntervencion).toHaveBeenCalledWith('v1', 'MARCAR_RESUELTO', 'Liberado a mano en Finanzas', expect.any(String));
  });
});

describe('decisión pendiente vista por quien no decide (R2F-3)', () => {
  it('al gerente una entrega observada le dice que la decide el despachador, sin el formulario', () => {
    const texto = montar({ data: { viaje: { ...viaje, estado: 'ENTREGA_OBSERVADA' } } });
    expect(texto).toContain('La entrega observada la decide el despachador.');
    expect(texto).not.toContain('Aprobar entrega');
  });

  it('al gerente una intervención le dice que la resuelve el despachador', () => {
    expect(montar({ data: { viaje: { ...viaje, estado: 'REQUIERE_INTERVENCION' } } })).toContain(
      'La intervención la resuelve el despachador.',
    );
  });
});
