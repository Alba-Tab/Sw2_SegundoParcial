import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { CreditoRepositorio } from '../data/credito.repositorio';
import { AprobacionesPagina } from './aprobaciones';

const solicitud = (estado: string, extra: Record<string, unknown> = {}) => ({
  servicioId: `s-${estado}`,
  clienteId: 'c1',
  razonSocial: 'Agro Moroso',
  monto: '7600.00',
  motivos: ['MORA'],
  estado,
  facturasVencidas: [],
  creadaEn: '2026-10-31T12:00:00Z',
  venceEn: '2026-11-01T12:00:00Z',
  decididaPor: null,
  motivoDecision: null,
  ...extra,
});

function montar(roles: string[], solicitudes: unknown[]): string {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-finanzas', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(roles), tiene: (...r: string[]) => roles.some((x) => r.includes(x)) } },
      {
        provide: CreditoRepositorio,
        useValue: { observarSolicitudes: () => ({ valueChanges: of({ loading: false, data: { solicitudesAprobacion: solicitudes } }) }) },
      },
    ],
  });
  const f = TestBed.createComponent(AprobacionesPagina);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent ?? '';
}

describe('aprobación de crédito vista por quien no decide (spec 012)', () => {
  it('R2F-3: al gerente una solicitud pendiente le dice que la decide administración', () => {
    const texto = montar(['gerente'], [solicitud('PENDIENTE')]);
    expect(texto).toContain('La decide administración.');
    expect(texto).not.toContain('Aprobar');
  });

  it('R2F-4: una decidida no muestra el sub, sino quién decide y el motivo aparte', () => {
    const sub = '7f3c2a10-1111-4222-8333-444455556666';
    const texto = montar(['gerente'], [solicitud('RECHAZADA', { decididaPor: sub, motivoDecision: 'Mora de 40 días' })]);
    expect(texto).not.toContain(sub);
    expect(texto).toContain('Decidida por administración');
    expect(texto).toContain('Motivo: Mora de 40 días');
  });

  it('R2F-4: una vencida no dice que alguien la decidió', () => {
    const texto = montar(
      ['administracion'],
      [solicitud('VENCIDA', { decididaPor: 'sistema', motivoDecision: 'Plazo de aprobación vencido' })],
    );
    expect(texto).not.toContain('sistema');
    expect(texto).not.toContain('Decidida por');
    expect(texto).toContain('Motivo: Plazo de aprobación vencido');
  });
});
