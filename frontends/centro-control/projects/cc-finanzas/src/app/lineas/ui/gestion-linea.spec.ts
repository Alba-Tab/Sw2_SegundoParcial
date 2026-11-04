import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { of, throwError } from 'rxjs';
import { CONFIG_CENTRO, Sesion, type ConfigCentro } from 'ui-comun';
import { LineasRepositorio } from '../data/lineas.repositorio';
import { LineasPagina } from './lineas';

const linea = { limite: '30000.00', reservado: '7600.00', utilizado: '2800.00', disponible: '19600.00', enMora: false, suspendida: false };
const clientes = [{ clienteId: 'c1', razonSocial: 'Agroexport SRL', nit: '1023456019', lineaCredito: linea }];

function montar(siguienteCursor: string | null = null, siguientes: typeof clientes = []) {
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
    observar: () => ({
      valueChanges: of({ loading: false, data: { clientes: { items: clientes, siguienteCursor } } }),
      refetch: vi.fn(async () => ({})),
    }),
    pagina: vi.fn(() => of({ loading: false, data: { clientes: { items: siguientes, siguienteCursor: null } } })),
    ajustar: vi.fn(() => of({ data: {} })),
    cambiarEstado: vi.fn((clienteId: string, suspendida: boolean) =>
      of({ data: { cambiarEstadoLineaCredito: { clienteId, suspendida } } }),
    ),
    linea: vi.fn(() => of({ loading: false, data: { lineaCredito: linea } })),
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

const fila = (raiz: HTMLElement, texto: string) => [...raiz.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(texto))!;

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

  it('una línea de «Cargar más» se muestra con lo que devolvió la mutación (recargar solo relee la primera página)', async () => {
    const otro = { clienteId: 'c2', razonSocial: 'Soya del Este', nit: '2034567011', lineaCredito: linea };
    const { f, raiz } = montar('k1', [otro]);
    await clic(f, boton(raiz, 'Cargar más clientes'));
    await f.whenStable();
    f.detectChanges();
    await clic(f, boton(raiz, 'la línea de Soya del Este'));
    await escribir(f, 'motivo', 'Cheque rechazado');
    await clic(f, boton(raiz, 'Suspender la línea'));
    await clic(f, boton(raiz, 'Sí, suspender la línea'));
    await f.whenStable();
    f.detectChanges();
    expect(fila(raiz, 'Soya del Este').textContent).toContain('Suspendida');
  });

  it('E2-7: si el ajuste de una fila de «Cargar más» choca (LIMITE_MENOR_QUE_USADO), relee esa línea y la muestra', async () => {
    const otro = { clienteId: 'c2', razonSocial: 'Soya del Este', nit: '2034567011', lineaCredito: linea };
    const { f, repo, raiz } = montar('k1', [otro]);
    const choque = new CombinedGraphQLErrors({
      data: null,
      errors: [
        { message: 'x', path: ['ajustarLineaCredito'], extensions: { codigo: 'LIMITE_MENOR_QUE_USADO', usado: { monto: '25000.00' } } },
      ],
    });
    repo.ajustar.mockReturnValueOnce(throwError(() => choque));
    repo.linea.mockReturnValueOnce(
      of({ loading: false, data: { lineaCredito: { ...linea, reservado: '22200.00', disponible: '5000.00' } } }),
    );
    await clic(f, boton(raiz, 'Cargar más clientes'));
    await f.whenStable();
    f.detectChanges();
    await clic(f, boton(raiz, 'la línea de Soya del Este'));
    await escribir(f, 'limite', '20000');
    await escribir(f, 'motivo', 'Revisión anual');
    await clic(f, boton(raiz, 'Cambiar el límite'));
    await clic(f, boton(raiz, 'Sí, cambiar el límite'));
    await f.whenStable();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(repo.linea).toHaveBeenCalledWith('c2');
    expect(fila(raiz, 'Soya del Este').textContent).toContain('22.200,00');
  });

  it('E2-7: en la primera página no relee aparte (la relee el refetch)', async () => {
    const { f, repo, raiz } = montar();
    const choque = new CombinedGraphQLErrors({
      data: null,
      errors: [{ message: 'x', path: ['ajustarLineaCredito'], extensions: { codigo: 'CONFLICTO_ESTADO' } }],
    });
    repo.ajustar.mockReturnValueOnce(throwError(() => choque));
    await clic(f, boton(raiz, 'Gestionar'));
    await escribir(f, 'limite', '50000');
    await escribir(f, 'motivo', 'Revisión anual');
    await clic(f, boton(raiz, 'Cambiar el límite'));
    await clic(f, boton(raiz, 'Sí, cambiar el límite'));
    await f.whenStable();
    expect(repo.ajustar).toHaveBeenCalled();
    expect(repo.linea).not.toHaveBeenCalled();
  });
});
