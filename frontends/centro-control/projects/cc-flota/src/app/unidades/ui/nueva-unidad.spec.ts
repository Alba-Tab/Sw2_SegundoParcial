import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { UnidadesRepositorio } from '../data/unidades.repositorio';
import { NuevaUnidadPagina } from './nueva-unidad';

function montar() {
  const crearUnidad = vi.fn((input: unknown) => of({ data: { crearUnidad: { unidadId: 'u9', input } } }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-flota', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(['jefe_flota']), tiene: (r: string) => r === 'jefe_flota' } },
      { provide: UnidadesRepositorio, useValue: { crearUnidad } },
    ],
  });
  const f = TestBed.createComponent(NuevaUnidadPagina);
  f.detectChanges();
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const el = f.nativeElement as HTMLElement;
  return { f, el, crearUnidad, navegar, texto: () => el.textContent ?? '' };
}

describe('alta de unidad (D104)', () => {
  it('el tracto pide odómetro y tanque; el remolque, su capacidad y los atributos de su tipo (D76)', () => {
    const { f, texto } = montar();
    expect(texto()).toContain('Odómetro');
    expect(texto()).toContain('Tanque (litros)');
    expect(texto()).not.toContain('Capacidad (toneladas)');
    const form = f.componentInstance.form;
    form.controls.tipoUnidad.setValue('REMOLQUE');
    form.controls.tipoRemolque.setValue('CISTERNA');
    f.detectChanges();
    expect(texto()).not.toContain('Odómetro');
    expect(texto()).toContain('Capacidad (toneladas)');
    expect(texto()).toContain('Compartimentos');
    expect(form.controls.kilometraje.disabled).toBe(true);
    expect(form.controls.campos.controls.atributos.controls['capacidadTanqueLitros'].disabled).toBe(true);
  });

  it('con errores no envía: marca los campos y enfoca el primero', async () => {
    const { f, el, crearUnidad } = montar();
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    f.detectChanges();
    expect(crearUnidad).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('input[formcontrolname="placa"]'));
    expect(el.textContent).toContain('Este dato es obligatorio.');
    el.remove();
  });

  it('envía el tracto con su clave de idempotencia y abre su ficha', async () => {
    const { f, crearUnidad, navegar } = montar();
    const form = f.componentInstance.form;
    form.patchValue({ placa: '9001tra', kilometraje: 1200, kmDesdeUltimoMantenimiento: 0 });
    form.controls.campos.patchValue({ soat: '2027-05-01', inspeccion: '2027-04-01', atributos: { capacidadTanqueLitros: 600 } });
    await f.componentInstance.guardar(f.nativeElement);
    expect(crearUnidad).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoUnidad: 'TRACTO',
        placa: '9001TRA',
        kilometraje: 1200,
        atributos: { capacidadTanqueLitros: 600 },
        claveIdempotencia: expect.any(String),
      }),
    );
    expect(navegar).toHaveBeenCalledWith(['/unidades', 'u9']);
  });
});
