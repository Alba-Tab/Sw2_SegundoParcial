import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { aCentavos, aParametros, estadoSegunda, filtrar, leerFiltro, normalizar, opcionesEstado, ordenar, paginar } from 'ui-comun/dominio';
import { controlLista, FiltrosLista, MemoriaListas, textoTope } from './lista';

const filas = [
  { placa: 'ABC-123', chofer: 'José Peña', estado: 'EN_RUTA', monto: '2800.00', km: 900 },
  { placa: 'XYZ-9', chofer: 'Ana Ríos', estado: 'ENTREGADO', monto: '150.50', km: null },
  { placa: 'ABD-7', chofer: 'Luis Soto', estado: 'EN_RUTA', monto: '10000.00', km: 120 },
];
const texto = (f: (typeof filas)[number]) => `${f.placa} ${f.chofer}`;

describe('listas: lo puro', () => {
  it('busca sin tildes ni mayúsculas y con todas las palabras', () => {
    expect(normalizar(' Peña ')).toBe('pena');
    expect(filtrar(filas, 'pena', texto).map((f) => f.placa)).toEqual(['ABC-123']);
    expect(filtrar(filas, 'ab luis', texto).map((f) => f.placa)).toEqual(['ABD-7']);
    expect(filtrar(filas, '', texto)).toHaveLength(3);
  });

  it('filtra por estado junto con la búsqueda', () => {
    expect(filtrar(filas, '', texto, 'EN_RUTA', (f) => f.estado)).toHaveLength(2);
    expect(filtrar(filas, 'abc', texto, 'EN_RUTA', (f) => f.estado)).toHaveLength(1);
    expect(filtrar(filas, '', texto, 'CERRADO', (f) => f.estado)).toHaveLength(0);
  });

  it('ordena texto en español, números y montos en centavos; los vacíos al final', () => {
    expect(ordenar(filas, (f) => f.chofer, 'asc').map((f) => f.chofer)).toEqual(['Ana Ríos', 'José Peña', 'Luis Soto']);
    expect(ordenar(filas, (f) => aCentavos(f.monto), 'desc').map((f) => f.monto)).toEqual(['10000.00', '2800.00', '150.50']);
    expect(ordenar(filas, (f) => f.km, 'asc').map((f) => f.km)).toEqual([120, 900, null]);
    expect(ordenar(filas, (f) => f.km, 'desc').map((f) => f.km)).toEqual([900, 120, null]);
    expect(ordenar(filas, undefined, 'asc')).toEqual(filas);
  });

  it('pagina y, si la página quedó fuera de rango, muestra la última', () => {
    const n = Array.from({ length: 12 }, (_, i) => i);
    expect(paginar(n, 1, 10)).toEqual([10, 11]);
    expect(paginar(n, 5, 10)).toEqual([10, 11]);
    expect(paginar([], 3, 10)).toEqual([]);
  });

  it('las opciones del filtro salen de ETIQUETAS, nunca el enum crudo', () => {
    expect(opcionesEstado('EstadoFactura')).toEqual([
      { valor: 'EMITIDA', texto: 'Por cobrar' },
      { valor: 'PAGADA_PARCIAL', texto: 'Pago parcial' },
      { valor: 'PAGADA', texto: 'Pagada' },
    ]);
    expect(opcionesEstado('EstadoViaje', ['EN_RUTA']).map((o) => o.texto)).toEqual(['En ruta']);
  });

  it('lee y escribe el filtro en la URL, con prefijo y sin los valores por defecto', () => {
    const url = new URLSearchParams('q=abc&estado=EN_RUTA&orden=placa&dir=desc&pagina=3&tamano=50&a-q=x');
    expect(leerFiltro((n) => url.get(n))).toEqual({ q: 'abc', estado: 'EN_RUTA', orden: 'placa', dir: 'desc', pagina: 2, tamano: 50 });
    expect(leerFiltro((n) => url.get(n), 'a-').q).toBe('x');
    expect(leerFiltro(() => 'basura')).toEqual({ q: 'basura', estado: 'basura', orden: 'basura', dir: '', pagina: 0, tamano: 25 });
    expect(aParametros({ q: '  ', pagina: 0, tamano: 25, estado: 'PAGADA' })).toEqual({
      q: null,
      pagina: null,
      tamano: null,
      estado: 'PAGADA',
    });
    expect(aParametros({ pagina: 2 }, 'a-')).toEqual({ 'a-pagina': '3' });
  });
});

describe('textoTope', () => {
  it('dice la verdad sobre qué parte de la lista cortó el servidor (V1-1, V1-3)', () => {
    expect(textoTope(80, 'viajes', 'antiguos', true)).toBe(
      'Se muestran los 80 viajes más antiguos; filtra por estado para ver los más nuevos.',
    );
    expect(textoTope(80, 'viajes', 'antiguos', false)).toContain('los más nuevos no aparecen');
    expect(textoTope(80, 'servicios', 'recientes', true)).toContain('los 80 servicios más recientes');
    expect(textoTope(100, 'clientes', null, false)).toContain('los primeros 100 clientes');
  });
});

describe('ControlLista', () => {
  it('filtra, ordena y pagina desde la URL, y escribe los cambios en la URL', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?estado=EN_RUTA&orden=placa&dir=desc&desde=cc-tablero');
    const lista = TestBed.runInInjectionContext(() =>
      controlLista({ filas: signal(filas), texto, estado: (f) => f.estado, orden: { placa: (f) => f.placa } }),
    );
    expect(lista.visibles().map((f) => f.placa)).toEqual(['ABD-7', 'ABC-123']);
    expect(lista.hayFiltros()).toBe(true);

    lista.buscar('peña');
    await new Promise((r) => setTimeout(r));
    expect(router.url).toContain('q=pe%C3%B1a');
    expect(router.url).toContain('desde=cc-tablero');
    expect(lista.visibles().map((f) => f.placa)).toEqual(['ABC-123']);

    lista.limpiar();
    await new Promise((r) => setTimeout(r));
    expect(router.url).not.toContain('estado=');
    expect(lista.total()).toBe(3);
  });

  it('la columna del orden inicial en desc pasa a asc (sin "sin orden") y la consulta queda para volver', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?q=abc');
    const lista = TestBed.runInInjectionContext(() =>
      controlLista({ filas: signal(filas), texto, orden: { placa: (f) => f.placa }, ordenInicial: { orden: 'placa', dir: 'desc' } }),
    );
    expect(lista.dir()).toBe('desc');
    lista.ordenarPor({ active: 'placa', direction: '' });
    await new Promise((r) => setTimeout(r));
    expect(lista.dir()).toBe('asc');
    TestBed.tick();
    expect(TestBed.inject(MemoriaListas).de('/')).toMatchObject({ q: 'abc', orden: 'placa', dir: 'asc' });
  });
});

describe('FiltrosLista', () => {
  it('FB-4: mientras no llega la primera respuesta dice «Cargando…», no «0 viajes»', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const datos = signal<typeof filas>([]);
    const lista = TestBed.runInInjectionContext(() => controlLista({ filas: datos, texto }));
    const f = TestBed.createComponent(FiltrosLista);
    f.componentRef.setInput('control', lista);
    f.componentRef.setInput('nombre', 'viajes');
    f.componentRef.setInput('singular', 'viaje');
    f.componentRef.setInput('cargando', true);
    expect(f.componentInstance.conteo()).toBe('Cargando…');
    datos.set(filas);
    expect(f.componentInstance.conteo()).toBe('3 viajes');
    datos.set([]);
    f.componentRef.setInput('cargando', false);
    expect(f.componentInstance.conteo()).toBe('0 viajes');
  });
});
