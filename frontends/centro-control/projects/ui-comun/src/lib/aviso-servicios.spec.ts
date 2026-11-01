import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Component, signal } from '@angular/core';
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

  it('el botón sigue enfocable mientras reintenta y un segundo clic no hace nada (foco)', async () => {
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
    f.detectChanges();
    await promesa;
  });
});

/**
 * V6-1: con un padre de verdad, `error`/`extra` cambian en la próxima detección de cambios del padre, no al resolver
 * `recargar`. Antes se probaba con `setInput` dentro del callback, que cambia la entrada al momento.
 */
@Component({
  imports: [AvisoServicios],
  template: `<cc-aviso-servicios [extra]="aviso()" [reintentar]="recargar" />`,
})
class PaginaAnfitriona {
  readonly aviso = signal<string | null>('Finanzas no disponible');
  /** Lo que deja el reintento: null si funcionó. */
  resultado: string | null = null;
  readonly recargar = async () => {
    // Como `refetch`: la señal cambia justo antes de resolver; la entrada del hijo, en el próximo render del padre.
    await new Promise((ok) => setTimeout(ok));
    this.aviso.set(this.resultado);
  };
}

describe('Reintentar con un padre real (V6-1, V4-3, V4-4)', () => {
  let h1: HTMLElement;
  let encabezado: HTMLElement;
  beforeEach(() => {
    encabezado = document.body.appendChild(document.createElement('cc-encabezado'));
    h1 = encabezado.appendChild(Object.assign(document.createElement('h1'), { tabIndex: -1 }));
  });
  afterEach(() => encabezado.remove());

  async function reintentar(resultado: string | null) {
    const f = TestBed.createComponent(PaginaAnfitriona);
    f.componentInstance.resultado = resultado;
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    const boton = el.querySelector<HTMLButtonElement>('button.reintentar')!;
    boton.focus();
    boton.click();
    // Hasta que termine el reintento, se renderice el padre y corra el `setTimeout` de `enfocarTitulo`.
    for (let i = 0; i < 5; i++) {
      await f.whenStable();
      await new Promise((ok) => setTimeout(ok));
    }
    return { el, boton, vivo: el.querySelector('[aria-live]')!.textContent!.trim() };
  }

  it('si funciona, no dice «Sigue sin responder» y el foco va al título', async () => {
    const { el, vivo } = await reintentar(null);
    expect(el.querySelector('button.reintentar')).toBeNull();
    expect(vivo).toBe('');
    expect(document.activeElement).toBe(h1);
  });

  it('si vuelve a fallar, lo anuncia y el foco se queda en «Reintentar»', async () => {
    const { el, vivo } = await reintentar('Finanzas no disponible');
    expect(vivo).toBe('Sigue sin responder: Finanzas no disponible');
    expect(document.activeElement).toBe(el.querySelector('button.reintentar'));
  });
});

describe('no encontrado (FB-2)', () => {
  const noEncontrado = new CombinedGraphQLErrors({
    data: { unidad: null },
    errors: [{ message: 'x', path: ['unidad'], extensions: { codigo: 'NO_ENCONTRADO' } }],
  });

  it('un detalle sin datos con NO_ENCONTRADO dice qué no se encontró, con search_off y sin «Reintentar»', () => {
    const f = TestBed.createComponent(AvisoServicios);
    f.componentRef.setInput('error', noEncontrado);
    f.componentRef.setInput('sinDatos', true);
    f.componentRef.setInput('buscado', 'esta unidad');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No encontramos esta unidad.');
    expect(el.querySelector('mat-icon')?.textContent).toBe('search_off');
    expect(el.textContent).not.toContain('cloud_off');
    expect(el.querySelector('button')).toBeNull();
  });

  it('con datos en pantalla, un NO_ENCONTRADO de otro campo no reemplaza la página', () => {
    const f = TestBed.createComponent(AvisoServicios);
    f.componentRef.setInput('error', noEncontrado);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('No encontramos');
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
