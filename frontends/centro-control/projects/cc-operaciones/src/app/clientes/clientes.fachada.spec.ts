import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Sesion } from 'ui-comun';
import { ClienteFachada, ClientesFachada } from './clientes.fachada';
import { ClientesRepositorio } from './data/clientes.repositorio';

const vacio = () => of({ data: undefined, loading: false });

function preparar(roles: string[]) {
  const repo = { observarClientes: vi.fn(vacio), observarCliente: vi.fn(vacio) };
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
    TestBed.inject(ClienteFachada).id.set('7f3c2a10-0000-4000-8000-000000000001');
    TestBed.tick();
    expect(repo.observarCliente).toHaveBeenCalledWith('7f3c2a10-0000-4000-8000-000000000001', false, false);
  });

  it('a comercial sí', () => {
    const repo = preparar(['comercial']);
    TestBed.inject(ClienteFachada).id.set('7f3c2a10-0000-4000-8000-000000000001');
    TestBed.tick();
    expect(repo.observarCliente).toHaveBeenCalledWith('7f3c2a10-0000-4000-8000-000000000001', true, true);
  });
});
