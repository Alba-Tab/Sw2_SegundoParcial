import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { ReportesRepositorio } from '../data/reportes.repositorio';
import { ReportesPagina } from './reportes';

const catalogo = [
  {
    reporteId: 'CUENTAS_POR_COBRAR',
    titulo: 'Cuentas por cobrar',
    descripcion: 'Facturas con saldo.',
    roles: ['administracion', 'gerente'],
  },
  {
    reporteId: 'VIAJES_EN_RIESGO',
    titulo: 'Viajes en riesgo',
    descripcion: 'Viajes en ruta con riesgo.',
    roles: ['despachador', 'gerente'],
  },
].map((r) => ({ ...r, maxDias: null, parametros: { properties: { umbral: {} } } }));

function montar(roles: string[]) {
  const reporte = vi.fn(() =>
    of({
      data: {
        reporte: {
          titulo: 'Viajes en riesgo',
          columnas: [],
          filas: [],
          totales: {},
          grafico: { tipo: 'BARRAS', ejeX: 'placa', series: [] },
        },
      },
    }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-tablero', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: () => roles, tiene: (...r: string[]) => roles.some((x) => r.includes(x)) } },
      { provide: ReportesRepositorio, useValue: { catalogo: () => of({ data: { catalogoReportes: catalogo, rutas: [] } }), reporte } },
    ],
  });
  const f = TestBed.createComponent(ReportesPagina);
  f.detectChanges();
  return { f, reporte, texto: () => (f.nativeElement as HTMLElement).textContent ?? '' };
}

describe('Reportes (JV-5)', () => {
  it('abre con el primer reporte que el rol puede ver, ya consultado, y dice de qué trata', async () => {
    const { f, reporte, texto } = montar(['despachador']);
    await f.whenStable();
    f.detectChanges();
    expect(reporte).toHaveBeenCalledWith('VIAJES_EN_RIESGO', { umbral: 0.7 });
    expect(f.componentInstance.elegido()).toBe('VIAJES_EN_RIESGO');
    expect(texto()).toContain('Viajes en ruta con riesgo.');
  });

  it('el gerente abre con cuentas por cobrar, la primera del catálogo', async () => {
    const { f, reporte } = montar(['gerente']);
    await f.whenStable();
    expect(reporte).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.elegido()).toBe('CUENTAS_POR_COBRAR');
  });
});
