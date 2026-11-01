import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { FacturasRepositorio } from './data/facturas.repositorio';
import { FacturaFachada } from './facturas.fachada';

type Emision = { data?: unknown; error?: unknown; loading: boolean };
const factura = (saldo: string) => ({ factura: { numero: 'F-1', saldo, pagos: [] } });
const sinRed = new Error('Failed to fetch');

/** Como el `QueryRef` de apollo-angular con `errorPolicy: 'all'`: `refetch` resuelve aunque falle la red (V6-3). */
function preparar() {
  const emisiones = new Subject<Emision>();
  const refetch = vi.fn<() => Promise<Emision>>();
  const observarFactura = vi.fn(() => ({ valueChanges: emisiones, refetch }));
  TestBed.configureTestingModule({ providers: [FacturaFachada, { provide: FacturasRepositorio, useValue: { observarFactura } }] });
  const fachada = TestBed.inject(FacturaFachada);
  fachada.id.set('f1');
  TestBed.tick();
  emisiones.next({ data: factura('100.00'), loading: false });
  return { fachada, emisiones, refetch };
}

describe('Factura: relectura que falla por red (V6-3)', () => {
  it('conserva los datos previos y `recargar` rechaza, para que la página lo diga', async () => {
    const { fachada, emisiones, refetch } = preparar();
    expect(fachada.factura()?.saldo).toBe('100.00');
    refetch.mockImplementation(async () => {
      emisiones.next({ data: undefined, error: sinRed, loading: false });
      return { data: undefined, error: sinRed, loading: false };
    });
    await expect(fachada.recargar()).rejects.toBe(sinRed);
    expect(fachada.factura()?.saldo).toBe('100.00');
  });

  it('si la relectura funciona, trae el saldo nuevo y resuelve', async () => {
    const { fachada, emisiones, refetch } = preparar();
    refetch.mockImplementation(async () => {
      emisiones.next({ data: factura('40.00'), loading: false });
      return { data: factura('40.00'), loading: false };
    });
    await fachada.recargar();
    expect(fachada.factura()?.saldo).toBe('40.00');
  });

  it('otra factura que falla no muestra los datos de la anterior', () => {
    const { fachada, emisiones } = preparar();
    expect(fachada.factura()).toBeDefined();
    fachada.id.set('f2');
    TestBed.tick();
    emisiones.next({ data: undefined, error: sinRed, loading: false });
    expect(fachada.factura()).toBeUndefined();
  });
});
