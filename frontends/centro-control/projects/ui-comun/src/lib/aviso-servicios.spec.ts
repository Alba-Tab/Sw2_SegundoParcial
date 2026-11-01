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

  it('un aviso [extra] de la página sale con su «Reintentar», aunque ningún servicio esté caído (V3-7)', () => {
    const f = TestBed.createComponent(AvisoServicios);
    f.componentRef.setInput('extra', 'No se pudo leer la línea de 2 clientes: la lista está incompleta.');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('No se pudo leer la línea de 2 clientes');
    expect(el.querySelector('button')?.textContent).toContain('Reintentar');
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

  it('si vuelve a fallar, lo anuncia; el botón sigue enfocable mientras reintenta (V4-4, foco)', async () => {
    const f = TestBed.createComponent(AvisoServicios);
    const recargar = vi.fn(() => Promise.resolve());
    f.componentRef.setInput('reintentar', recargar);
    f.componentRef.setInput('extra', 'Finanzas no disponible');
    f.detectChanges();
    const vivo = (f.nativeElement as HTMLElement).querySelector('[aria-live]')!;
    const boton = (f.nativeElement as HTMLElement).querySelector('button')!;
    const promesa = f.componentInstance.reintentarAhora();
    f.detectChanges();
    expect(vivo.textContent).toContain('Reintentando…');
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    await f.componentInstance.reintentarAhora();
    expect(recargar).toHaveBeenCalledTimes(1);
    await promesa;
    f.detectChanges();
    expect(vivo.textContent).toContain('Sigue sin responder: Finanzas no disponible');
  });

  it('si funciona, la región queda vacía y el foco va al título, no a <body> (V4-3)', async () => {
    vi.useFakeTimers();
    const h1 = Object.assign(document.createElement('h1'), { tabIndex: -1 });
    const encabezado = document.body.appendChild(document.createElement('cc-encabezado'));
    encabezado.appendChild(h1);
    const f = TestBed.createComponent(AvisoServicios);
    f.componentRef.setInput('reintentar', () => {
      f.componentRef.setInput('extra', null);
      return Promise.resolve();
    });
    f.componentRef.setInput('extra', 'Finanzas no disponible');
    f.detectChanges();
    await f.componentInstance.reintentarAhora();
    vi.runAllTimers();
    expect(f.componentInstance.anuncio()).toBe('');
    expect(document.activeElement).toBe(h1);
    encabezado.remove();
    vi.useRealTimers();
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
