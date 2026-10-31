import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Alertas } from './alertas';
import { CONFIG_CENTRO, type ConfigCentro } from './configuracion';
import { appDisponible, INTERVALO_SALUD_MS, Marco } from './marco';
import { Sesion } from './sesion';

const respuesta = (status: number, cuerpo: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

describe('Marco: disponibilidad de las apps (FR3, spec 016 paso 16)', () => {
  it('pide /salud.json con CORS y exige un 2xx con {"estado":"UP"}', async () => {
    const pedir = vi.fn(async () => respuesta(200, { estado: 'UP' }));
    expect(await appDisponible('https://cc-flota.web.app', pedir)).toBe(true);
    expect(pedir).toHaveBeenCalledWith('https://cc-flota.web.app/salud.json', expect.objectContaining({ mode: 'cors', cache: 'no-store' }));
  });

  it('un hosting deshabilitado ("Site Not Found"), un 5xx, otro cuerpo, el CORS o la red: no disponible', async () => {
    expect(await appDisponible('u', async () => respuesta(404, null))).toBe(false);
    expect(await appDisponible('u', async () => respuesta(500, { estado: 'UP' }))).toBe(false);
    expect(await appDisponible('u', async () => respuesta(200, { estado: 'DOWN' }))).toBe(false);
    expect(
      await appDisponible('u', async () => ({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError('HTML')) }) as never),
    ).toBe(false);
    expect(await appDisponible('u', () => Promise.reject(new TypeError('Failed to fetch')))).toBe(false);
  });

  describe('en el componente', () => {
    const urls = {
      'cc-tablero': 'http://t',
      'cc-operaciones': 'http://o',
      'cc-flota': 'http://f',
      'cc-finanzas': 'http://fi',
      'portal-cliente': 'http://p',
    };
    let pedir: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      pedir = vi.fn(async (url: string) => (url.startsWith('http://f/') ? respuesta(404, null) : respuesta(200, { estado: 'UP' })));
      vi.stubGlobal('fetch', pedir);
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: CONFIG_CENTRO, useValue: { app: 'cc-tablero', urls } as unknown as ConfigCentro },
          {
            provide: Sesion,
            useValue: {
              roles: signal(['gerente']),
              rolesInternos: signal(['gerente']),
              nombre: signal('Gerente'),
              tiene: (...roles: string[]) => roles.includes('gerente'),
            },
          },
          {
            provide: Alertas,
            useValue: {
              iniciar: vi.fn(async () => undefined),
              abiertas: signal(0),
              disponible: signal(true),
              lista: signal([]),
              errorAtencion: signal(null),
            },
          },
        ],
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it('marca "no disponible" la app que no responde UP y deja de revisar al destruirse', async () => {
      const f = TestBed.createComponent(Marco);
      f.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      expect(pedir).toHaveBeenCalledTimes(3); // las otras 3 apps del gerente
      expect([...f.componentInstance.caidas()]).toEqual(['cc-flota']);

      await vi.advanceTimersByTimeAsync(INTERVALO_SALUD_MS);
      expect(pedir).toHaveBeenCalledTimes(6);

      f.destroy();
      await vi.advanceTimersByTimeAsync(3 * INTERVALO_SALUD_MS);
      expect(pedir).toHaveBeenCalledTimes(6);
    });
  });
});
