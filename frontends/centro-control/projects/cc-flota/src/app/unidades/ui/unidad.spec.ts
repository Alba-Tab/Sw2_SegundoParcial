import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { UnidadesRepositorio } from '../data/unidades.repositorio';
import { UnidadPagina } from './unidad';

const UNIDAD = {
  unidadId: 'u1',
  tipoUnidad: 'REMOLQUE',
  placa: '3001FUR',
  tipoRemolque: 'FURGON',
  capacidadToneladas: 30,
  kilometraje: null,
  kmDesdeUltimoMantenimiento: 0,
  documentos: [
    { tipo: 'SOAT', venceEl: '2027-05-01' },
    { tipo: 'INSPECCION_TECNICA', venceEl: '2027-04-01' },
  ],
  atributos: { volumenM3: 85 },
};

function montar(estado: string) {
  const darDeBaja = vi.fn(() => of({ data: {} }));
  const editarUnidad = vi.fn(() => of({ data: {} }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-flota', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(['jefe_flota']), tiene: (r: string) => r === 'jefe_flota' } },
      {
        provide: UnidadesRepositorio,
        useValue: {
          observarUnidad: () => ({
            valueChanges: of({ loading: false, data: { unidad: { ...UNIDAD, estado }, mantenimientos: [] } }),
            refetch: () => Promise.resolve(),
          }),
          darDeBaja,
          editarUnidad,
        },
      },
    ],
  });
  const f = TestBed.createComponent(UnidadPagina);
  f.componentRef.setInput('id', 'u1');
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const boton = (texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith(texto));
  return { f, el, boton, darDeBaja, editarUnidad };
}

describe('ficha de la unidad: edición y baja (D104)', () => {
  it('en viaje no se edita ni se da de baja', () => {
    const { boton } = montar('EN_VIAJE');
    expect(boton('Editar')).toBeUndefined();
    expect(boton('Dar de baja')).toBeUndefined();
  });

  it('la baja pide motivo y confirmación antes de enviarse', async () => {
    const { f, el, boton, darDeBaja } = montar('DISPONIBLE');
    boton('Dar de baja')!.click();
    f.detectChanges();
    f.componentInstance.motivoBaja.setValue('Vendida');
    boton('Dar de baja…')!.click();
    f.detectChanges();
    expect(darDeBaja).not.toHaveBeenCalled();
    expect(el.textContent).toContain('3001FUR queda inactiva');
    boton('Sí, dar de baja')!.click();
    await f.whenStable();
    expect(darDeBaja).toHaveBeenCalledWith({ unidadId: 'u1', motivo: 'Vendida', claveIdempotencia: expect.any(String) });
  });

  it('la edición parte de lo que la unidad tiene y manda capacidad, documentos y atributos', async () => {
    const { f, boton, editarUnidad } = montar('MANTENIMIENTO_PENDIENTE');
    boton('Editar')!.click();
    f.detectChanges();
    f.componentInstance.edicion.controls.soat.setValue('2028-05-01');
    await f.componentInstance.editar(f.componentInstance.unidad()!, f.nativeElement);
    expect(editarUnidad).toHaveBeenCalledWith({
      unidadId: 'u1',
      capacidadToneladas: 30,
      documentos: [
        { tipo: 'SOAT', venceEl: '2028-05-01' },
        { tipo: 'INSPECCION_TECNICA', venceEl: '2027-04-01' },
      ],
      atributos: { volumenM3: 85 },
      claveIdempotencia: expect.any(String),
    });
  });
});
