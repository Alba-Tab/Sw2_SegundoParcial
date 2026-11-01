import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RutasRepositorio } from './data/rutas.repositorio';
import { valoresIniciales } from './domain/ruta';
import { RutaFachada, RutasFachada } from './rutas.fachada';

const ID = '7f3c2a10-0000-4000-8000-000000000004';
const valores = {
  ...valoresIniciales(),
  nombre: 'SCZ - LPZ',
  origen: 'Santa Cruz',
  origenLat: -17.78,
  origenLng: -63.18,
  destino: 'La Paz',
  destinoLat: -16.5,
  destinoLng: -68.15,
  distanciaKm: 850,
};

function preparar() {
  const refetch = vi.fn(() => Promise.reject(new Error('sin red')));
  const consulta = () => ({ valueChanges: of({ data: undefined, loading: false }), refetch });
  const repo = {
    observar: vi.fn(consulta),
    observarRuta: vi.fn(consulta),
    crear: vi.fn(() => of({ data: { crearRuta: { rutaId: ID } } })),
    editar: vi.fn(() => of({ data: {} })),
  };
  TestBed.configureTestingModule({ providers: [RutasFachada, RutaFachada, { provide: RutasRepositorio, useValue: repo }] });
  return { repo, refetch };
}

describe('rutas: escrituras (G4, E10-1)', () => {
  it('el alta va sin activa y devuelve la ruta aunque la relectura falle', async () => {
    const { repo, refetch } = preparar();
    await expect(TestBed.inject(RutasFachada).crear({ ...valores, activa: true })).resolves.toBe(ID);
    expect(refetch).toHaveBeenCalled();
    const input = (repo.crear.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(input).not.toHaveProperty('activa');
    expect(input['claveIdempotencia']).toEqual(expect.any(String));
  });

  it('la edición lleva activa y termina bien aunque la relectura falle', async () => {
    const { repo } = preparar();
    const fachada = TestBed.inject(RutaFachada);
    fachada.id.set(ID);
    TestBed.tick();
    await expect(fachada.editar(ID, { ...valores, activa: true })).resolves.toBeUndefined();
    expect(repo.editar).toHaveBeenCalledWith(ID, expect.objectContaining({ activa: true, claveIdempotencia: expect.any(String) }));
  });
});
