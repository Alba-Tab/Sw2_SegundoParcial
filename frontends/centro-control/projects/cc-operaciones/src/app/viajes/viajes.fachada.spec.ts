import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Sesion } from 'ui-comun';
import { ServiciosRepositorio } from '../servicios/data/servicios.repositorio';
import { ServiciosFachada } from '../servicios/servicios.fachada';
import { ViajesRepositorio } from './data/viajes.repositorio';
import { MapaFachada, ViajeFachada } from './viajes.fachada';

/** Como el `QueryRef` de apollo-angular: los datos y el `refetch` del mismo `watch`. */
const vacio = () => ({ valueChanges: of({ data: undefined, loading: false }), refetch: vi.fn(() => Promise.resolve({})) });

function preparar(roles: string[]) {
  const viajes = { observarMapa: vi.fn(() => vacio().valueChanges), observarViaje: vi.fn(vacio) };
  const servicios = { observar: vi.fn(vacio) };
  TestBed.configureTestingModule({
    providers: [
      MapaFachada,
      ViajeFachada,
      ServiciosFachada,
      { provide: Sesion, useValue: { roles: signal(roles) } },
      { provide: ViajesRepositorio, useValue: viajes },
      { provide: ServiciosRepositorio, useValue: servicios },
    ],
  });
  return { viajes, servicios };
}

describe('campos con @roles: no se piden al rol que no los ve (sin un SIN_PERMISO por fila)', () => {
  it('al despachador no se le pide el monto de servicios ni del viaje', () => {
    const { viajes, servicios } = preparar(['despachador']);
    expect(TestBed.inject(ServiciosFachada).verMonto).toBe(false);
    TestBed.tick();
    expect(servicios.observar).toHaveBeenCalledWith(null, false, 20_000);
    const viaje = TestBed.inject(ViajeFachada);
    viaje.id.set('v1');
    TestBed.tick();
    expect(viajes.observarViaje).toHaveBeenCalledWith({ id: 'v1', verMonto: false, verRiesgo: true, verUnidad: true }, 20_000);
  });

  it('a comercial no se le pide el riesgo en el mapa ni la unidad del viaje', () => {
    const { viajes } = preparar(['comercial']);
    TestBed.inject(MapaFachada);
    expect(viajes.observarMapa).toHaveBeenCalledWith({ verRiesgo: false }, 15_000);
    const viaje = TestBed.inject(ViajeFachada);
    viaje.id.set('v1');
    TestBed.tick();
    expect(viajes.observarViaje).toHaveBeenCalledWith({ id: 'v1', verMonto: true, verRiesgo: false, verUnidad: false }, 20_000);
  });
});

describe('recargar es un refetch del mismo watch (V4-1)', () => {
  it('el detalle del viaje y los servicios recargan con el refetch del watch que alimenta la página', async () => {
    const { viajes, servicios } = preparar(['gerente']);
    const viaje = TestBed.inject(ViajeFachada);
    await viaje.recargar();
    viaje.id.set('v1');
    TestBed.tick();
    await viaje.recargar();
    expect(viajes.observarViaje.mock.results[0].value.refetch).toHaveBeenCalledTimes(1);
    const lista = TestBed.inject(ServiciosFachada);
    TestBed.tick();
    await lista.recargar();
    expect(servicios.observar.mock.results.at(-1)!.value.refetch).toHaveBeenCalledTimes(1);
  });
});
