import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Sesion } from 'ui-comun';
import { ClienteFachada, ClientesFachada } from './clientes.fachada';
import { ClientesRepositorio } from './data/clientes.repositorio';

const vacio = () => of({ data: undefined, loading: false });
const ID = '7f3c2a10-0000-4000-8000-000000000001';

function preparar(roles: string[]) {
  const refetch = vi.fn(() => Promise.resolve());
  const repo = {
    observarClientes: vi.fn(vacio),
    observarCliente: vi.fn(() => ({ valueChanges: vacio(), refetch })),
    editar: vi.fn(() => of({ data: {} })),
    pagina: vi.fn(() => of({ data: { clientes: { items: [{ clienteId: 'c3' }], siguienteCursor: null } } })),
    refetch,
  };
  TestBed.configureTestingModule({
    providers: [
      ClientesFachada,
      ClienteFachada,
      { provide: Sesion, useValue: { roles: signal(roles) } },
      { provide: ClientesRepositorio, useValue: repo },
    ],
  });
  return repo;
}

describe('clientes: la línea de crédito y el monto solo a quien los ve', () => {
  it('al despachador no se le piden', () => {
    const repo = preparar(['despachador']);
    TestBed.inject(ClientesFachada);
    expect(repo.observarClientes).toHaveBeenCalledWith(false, 60_000);
    TestBed.inject(ClienteFachada).id.set(ID);
    TestBed.tick();
    expect(repo.observarCliente).toHaveBeenCalledWith(ID, false, false);
  });

  it('a comercial sí', () => {
    const repo = preparar(['comercial']);
    TestBed.inject(ClienteFachada).id.set(ID);
    TestBed.tick();
    expect(repo.observarCliente).toHaveBeenCalledWith(ID, true, true);
  });
});

describe('clientes: edición (G7)', () => {
  it('envía los datos recortados con una clave y relee la ficha', async () => {
    const repo = preparar(['comercial']);
    const fachada = TestBed.inject(ClienteFachada);
    fachada.id.set(ID);
    TestBed.tick();
    await fachada.editar(ID, { razonSocial: ' Agro SRL ', nit: '1020304 ', correo: ' a@agro.bo' });
    expect(repo.editar).toHaveBeenCalledWith(ID, {
      razonSocial: 'Agro SRL',
      nit: '1020304',
      correo: 'a@agro.bo',
      claveIdempotencia: expect.any(String),
    });
    expect(repo.refetch).toHaveBeenCalled();
  });

  it('E10-1: si la relectura falla, la edición igual termina bien (no se ofrece reenviar con otra clave)', async () => {
    const repo = preparar(['gerente']);
    repo.refetch.mockRejectedValueOnce(new Error('sin red'));
    const fachada = TestBed.inject(ClienteFachada);
    fachada.id.set(ID);
    TestBed.tick();
    await expect(fachada.editar(ID, { razonSocial: 'Agro SRL', nit: '1020304', correo: 'a@agro.bo' })).resolves.toBeUndefined();
  });
});

describe('clientes: «Cargar más» (E5-1)', () => {
  it('pide la página siguiente con el cursor de la primera y la agrega al final', async () => {
    const repo = preparar(['comercial']);
    repo.observarClientes.mockReturnValue(
      of({ data: { clientes: { items: [{ clienteId: 'c1' }, { clienteId: 'c2' }], siguienteCursor: 'p2' } }, loading: false }) as never,
    );
    const fachada = TestBed.inject(ClientesFachada);
    expect(fachada.paginas.siguienteCursor()).toBe('p2');
    await fachada.paginas.cargarMas();
    expect(repo.pagina).toHaveBeenCalledWith(true, 'p2');
    expect(fachada.clientes().map((c) => c.clienteId)).toEqual(['c1', 'c2', 'c3']);
    expect(fachada.paginas.siguienteCursor()).toBeNull();
  });
});
