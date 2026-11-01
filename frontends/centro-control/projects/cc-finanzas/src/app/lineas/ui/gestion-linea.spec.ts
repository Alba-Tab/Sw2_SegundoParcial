import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { LineasRepositorio } from '../data/lineas.repositorio';
import { LineasPagina } from './lineas';

const linea = { limite: '30000.00', reservado: '7600.00', utilizado: '2800.00', disponible: '19600.00', enMora: false, suspendida: false };
const clientes = [{ clienteId: 'c1', razonSocial: 'Agroexport SRL', nit: '1023456019', lineaCredito: linea }];

function montar() {
  // jsdom no trae matchMedia (columnasConEstado la usa para pantallas angostas).
  const nada = () => undefined;
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: nada,
    removeEventListener: nada,
    addListener: nada,
    removeListener: nada,
  }));
  const repo = {
    observar: () => ({ valueChanges: of({ loading: false, data: { clientes } }), refetch: vi.fn(async () => ({})) }),
    ajustar: vi.fn(() => of({ data: {} })),
    cambiarEstado: vi.fn(() => of({ data: {} })),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CONFIG_CENTRO, useValue: { app: 'cc-finanzas', urls: {} } as unknown as ConfigCentro },
      { provide: Sesion, useValue: { roles: signal(['administracion']), tiene: () => true } },
      { provide: LineasRepositorio, useValue: repo },
    ],
  });
  const f = TestBed.createComponent(LineasPagina);
  f.detectChanges();
  return { f, repo, raiz: f.nativeElement as HTMLElement };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(texto))!;

async function escribir(f: ComponentFixture<unknown>, nombre: string, valor: string) {
  const input = (f.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[formcontrolname="${nombre}"]`)!;
  input.value = valor;
  input.dispatchEvent(new Event('input'));
  await f.whenStable();
}

async function clic(f: ComponentFixture<unknown>, b: HTMLButtonElement) {
  b.click();
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
}

describe('gestión de la línea de crédito (G6, spec 012)', () => {
  it('el límite no baja de lo usado: el campo lo dice y no se envía nada', async () => {
    const { f, repo, raiz } = montar();
    await clic(f, boton(raiz, 'Gestionar'));
    await escribir(f, 'limite', '10399.99');
    await escribir(f, 'motivo', 'Revisión anual');
    await clic(f, boton(raiz, 'Cambiar el límite'));
    expect(raiz.textContent).toContain('No puede ser menor que 10.400,00');
    expect(raiz.textContent).not.toContain('Sí, cambiar el límite');
    expect(repo.ajustar).not.toHaveBeenCalled();
  });

  it('ajustar: resumen con el límite y el disponible; al confirmar va con la clave del intento', async () => {
    const { f, repo, raiz } = montar();
    await clic(f, boton(raiz, 'Gestionar'));
    await escribir(f, 'limite', '50000');
    await escribir(f, 'motivo', '  Revisión anual  ');
    await clic(f, boton(raiz, 'Cambiar el límite'));
    expect(raiz.textContent).toContain('pasa de 30.000,00 BOB a 50.000,00 BOB');
    expect(raiz.textContent).toContain('el disponible queda en 39.600,00 BOB');
    await clic(f, boton(raiz, 'Sí, cambiar el límite'));
    expect(repo.ajustar).toHaveBeenCalledWith('c1', '50000.00', 'Revisión anual', expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  it('suspender pide solo el motivo y confirma con lo que pasa con los servicios nuevos', async () => {
    const { f, repo, raiz } = montar();
    await clic(f, boton(raiz, 'Gestionar'));
    await clic(f, boton(raiz, 'Suspender la línea'));
    expect(raiz.textContent).toContain('Este dato es obligatorio.');
    await escribir(f, 'motivo', 'Cheque rechazado');
    await clic(f, boton(raiz, 'Suspender la línea'));
    expect(raiz.textContent).toContain('sus servicios nuevos se rechazarán hasta reactivarla');
    await clic(f, boton(raiz, 'Sí, suspender la línea'));
    expect(repo.cambiarEstado).toHaveBeenCalledWith('c1', true, 'Cheque rechazado', expect.any(String));
    expect(repo.ajustar).not.toHaveBeenCalled();
  });
});
