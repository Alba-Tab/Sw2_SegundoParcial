import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { ChoferesRepositorio } from '../data/choferes.repositorio';
import { ChoferPagina } from './chofer';

const ID = '0193a000-0000-7000-8000-00000000c301';

function montar(roles: string[], chofer: Record<string, unknown>) {
  const cambiarHabilitacion = vi.fn(() => of({ data: {} }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-flota', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(roles), tiene: (...r: string[]) => roles.some((x) => r.includes(x)) } },
      {
        provide: ChoferesRepositorio,
        useValue: {
          observarChofer: () => ({
            valueChanges: of({
              loading: false,
              data: {
                chofer: { choferId: ID, nombre: 'Juan Mamani', licenciaCategoria: 'C', licenciaVenceEl: '2029-03-15', ...chofer },
                puntajesConduccion: null,
              },
            }),
            refetch: () => Promise.resolve(),
          }),
          cambiarHabilitacion,
        },
      },
    ],
  });
  const f = TestBed.createComponent(ChoferPagina);
  f.componentRef.setInput('id', ID);
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const boton = (texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto));
  return { f, el, boton, cambiarHabilitacion };
}

describe('ficha del chofer (D104)', () => {
  it('con una reserva activa no ofrece inhabilitar y dice por qué; el gerente no ve acciones', () => {
    const ocupado = montar(['jefe_flota'], { activo: true, disponible: false });
    expect(ocupado.boton('Inhabilitar')).toBeUndefined();
    expect(ocupado.boton('Editar')).toBeDefined();
    expect(ocupado.el.textContent).toContain('Tiene un viaje asignado');
    TestBed.resetTestingModule();
    const gerente = montar(['gerente'], { activo: true, disponible: true });
    expect(gerente.boton('Editar')).toBeUndefined();
    expect(gerente.boton('Inhabilitar')).toBeUndefined();
  });

  it('inhabilitar pide el motivo, confirma y lo envía', async () => {
    const { f, el, boton, cambiarHabilitacion } = montar(['jefe_flota'], { activo: true, disponible: true });
    boton('Inhabilitar')!.click();
    f.detectChanges();
    boton('Inhabilitar…')!.click();
    f.detectChanges();
    expect(cambiarHabilitacion).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Este dato es obligatorio.');
    f.componentInstance.motivo.setValue('Licencia retenida');
    boton('Inhabilitar…')!.click();
    f.detectChanges();
    expect(el.textContent).toContain('no recibe viajes nuevos');
    boton('Sí, inhabilitar')!.click();
    await f.whenStable();
    expect(cambiarHabilitacion).toHaveBeenCalledWith(
      expect.objectContaining({ choferId: ID, activo: false, motivo: 'Licencia retenida', claveIdempotencia: expect.any(String) }),
    );
  });

  it('un chofer inhabilitado muestra el motivo y se habilita sin motivo', async () => {
    const { f, el, boton, cambiarHabilitacion } = montar(['jefe_flota'], {
      activo: false,
      disponible: true,
      motivoInhabilitacion: 'Vacaciones',
    });
    expect(el.textContent).toContain('Vacaciones');
    boton('Habilitar')!.click();
    await f.whenStable();
    expect(cambiarHabilitacion).toHaveBeenCalledWith({ choferId: ID, activo: true, claveIdempotencia: expect.any(String) });
  });
});
