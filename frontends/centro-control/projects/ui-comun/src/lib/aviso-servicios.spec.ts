import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { AvisoServicios } from './aviso-servicios';
import { ordenarFilas } from './tabla-reporte';
import { mostrarFalloArranque } from './proveedores';

describe('Reintentar (revisión E-2)', () => {
  it('sin [reintentar], vuelve a pedir las consultas activas; nunca recarga la página', () => {
    const refetchObservableQueries = vi.fn(() => Promise.resolve([]));
    TestBed.configureTestingModule({ providers: [{ provide: Apollo, useValue: { client: { refetchObservableQueries } } }] });
    const f = TestBed.createComponent(AvisoServicios);
    f.componentInstance.reintentarAhora();
    expect(refetchObservableQueries).toHaveBeenCalledTimes(1);
  });

  it('con [reintentar], usa el recargar de la página', () => {
    const recargar = vi.fn(() => Promise.resolve());
    const f = TestBed.createComponent(AvisoServicios);
    f.componentRef.setInput('reintentar', recargar);
    f.componentInstance.reintentarAhora();
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('mientras reintenta lo dice y vuelve a habilitar aunque falle (V2-9)', async () => {
    let fallar!: (e: unknown) => void;
    const f = TestBed.createComponent(AvisoServicios);
    f.componentRef.setInput('reintentar', () => new Promise((_, no) => (fallar = no)));
    const promesa = f.componentInstance.reintentarAhora();
    expect(f.componentInstance.reintentando()).toBe(true);
    fallar(new Error('sigue caído'));
    await promesa;
    expect(f.componentInstance.reintentando()).toBe(false);
  });
});

describe('tabla de un reporte', () => {
  it('ordena los montos en centavos (no como texto) y deja los vacíos al final', () => {
    const filas = [{ saldo: '900.00' }, { saldo: null }, { saldo: '10000.00' }, { saldo: '2800.50' }];
    const col = { clave: 'saldo', titulo: 'Saldo', tipo: 'MONTO' };
    expect(ordenarFilas(filas, col, 'desc').map((f) => f['saldo'])).toEqual(['10000.00', '2800.50', '900.00', null]);
    expect(ordenarFilas(filas, col, 'asc').map((f) => f['saldo'])).toEqual(['900.00', '2800.50', '10000.00', null]);
    expect(ordenarFilas(filas, undefined, '')).toEqual(filas);
  });
});

describe('arranque sin configuración (fuera de la Fase E)', () => {
  it('dice qué pasó sin el mensaje técnico y ofrece Reintentar', () => {
    const doc = document.implementation.createHTMLDocument();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mostrarFalloArranque('Flota', new Error('Unexpected token < in JSON at position 0'), doc);
    expect(doc.body.textContent).toContain('No se pudo iniciar Flota');
    expect(doc.body.textContent).not.toContain('Unexpected token');
    expect(doc.querySelector('button')?.textContent).toBe('Reintentar');
  });
});
