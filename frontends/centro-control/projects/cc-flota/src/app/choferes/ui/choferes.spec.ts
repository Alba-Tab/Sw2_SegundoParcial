import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { ChoferesRepositorio } from '../data/choferes.repositorio';
import { ChoferesPagina } from './choferes';

const chofer = (choferId: string, nombre: string) => ({
  choferId,
  nombre,
  licenciaCategoria: 'C',
  licenciaVenceEl: '2029-03-15',
  activo: true,
  disponible: true,
  motivoInhabilitacion: null,
});

describe('lista de choferes por cursor (E5-1, PaginasCursor de ui-comun)', () => {
  it('si «Cargar más» falla lo dice y ofrece «Reintentar»; al reintentar agrega la página', async () => {
    // jsdom no trae matchMedia (columnasConEstado la usa para pantallas angostas).
    const nada = () => undefined;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: nada,
      removeEventListener: nada,
      addListener: nada,
      removeListener: nada,
    }));
    const pagina = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('Sin conexión')))
      .mockReturnValueOnce(of({ loading: false, data: { choferes: { items: [chofer('c2', 'Rosa Quispe')], siguienteCursor: null } } }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CONFIG_CENTRO, useValue: { app: 'cc-flota', urls: {} } as unknown as ConfigCentro },
        { provide: Sesion, useValue: { roles: signal(['jefe_flota']), tiene: () => true } },
        {
          provide: ChoferesRepositorio,
          useValue: {
            observarChoferes: () =>
              of({ loading: false, data: { choferes: { items: [chofer('c1', 'Juan Mamani')], siguienteCursor: 'k1' } } }),
            pagina,
          },
        },
      ],
    });
    const f = TestBed.createComponent(ChoferesPagina);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const boton = (texto: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;
    const clic = async (b: HTMLButtonElement) => {
      b.click();
      await f.whenStable();
      f.detectChanges();
    };

    await clic(boton('Cargar más choferes'));
    expect(el.textContent).toContain('No se pudieron cargar más choferes.');
    await clic(boton('Reintentar'));
    expect(pagina).toHaveBeenLastCalledWith('k1');
    expect(el.textContent).toContain('Rosa Quispe');
    expect(el.textContent).not.toContain('No se pudieron cargar más choferes.');
    expect(boton('Cargar más')).toBeUndefined();
  });
});
