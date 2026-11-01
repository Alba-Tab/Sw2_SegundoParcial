import { Component, computed, DestroyRef, effect, inject, Injectable, input, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import type { Sort } from '@angular/material/sort';
import { ActivatedRoute, Router, type Params } from '@angular/router';
import { Esqueleto } from './esqueleto';
import {
  aParametros,
  estadoSegunda,
  filtrar,
  leerFiltro,
  opcionesEstado,
  ordenar,
  paginar,
  TAMANOS_PAGINA,
  type Direccion,
  type FiltroLista,
  type GrupoEtiqueta,
} from 'ui-comun/dominio';

type Valor = string | number | bigint | null | undefined;

export interface OpcionesLista<T> {
  filas: Signal<readonly T[]>;
  /** El texto donde busca la caja de búsqueda (placa, cliente, ruta…). */
  texto: (f: T) => string;
  /** El valor del enum por el que filtra el selector de estado. */
  estado?: (f: T) => string | null | undefined;
  /** Por columna de `matSort`, el valor con el que se ordena (montos en centavos, fechas ISO). */
  orden?: Record<string, (f: T) => Valor>;
  /** El orden cuando la URL no pide otro. */
  ordenInicial?: { orden: string; dir: Exclude<Direccion, ''> };
  /** Separa los parámetros de dos listas en la misma página. */
  prefijo?: string;
  /** El estado que se muestra si la URL no pide otro (lo que pide acción, D-4); "Todos" se escribe como `estado=todos`. */
  estadoInicial?: string;
}

/** En la URL, "Todos" explícito cuando la lista tiene un estado inicial. */
const TODOS = 'todos';

/** Lo que leen los componentes de la lista, sin el tipo de la fila. */
export type VistaLista = Pick<
  ControlLista<unknown>,
  'filas' | 'filtro' | 'total' | 'pagina' | 'hayFiltros' | 'buscar' | 'filtrarEstado' | 'irAPagina' | 'limpiar'
>;

/**
 * Estado de una lista con búsqueda, filtro por estado, orden y paginación local (U1). El filtro vive en la URL (query
 * params, sin entrada nueva en el historial) para que volver desde el detalle lo conserve. Se crea en el contexto de
 * inyección del componente: `readonly lista = controlLista({ filas: this.unidades, texto: (u) => u.placa })`.
 */
/** La última consulta (búsqueda, filtro, orden, página) de cada lista, para que "volver" desde el detalle la conserve (C-3). */
@Injectable({ providedIn: 'root' })
export class MemoriaListas {
  private readonly consultas = new Map<string, Params>();
  guardar(ruta: string, params: Params): void {
    this.consultas.set(ruta, params);
  }
  /** Los query params guardados de esa ruta (`/viajes`), o null si no se visitó. */
  de(ruta: string | undefined): Params | null {
    return (ruta && this.consultas.get(ruta)) || null;
  }
}

export class ControlLista<T> {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly params = toSignal(this.ruta.queryParamMap, { requireSync: true });
  readonly filas: Signal<readonly T[]>;
  readonly filtro: Signal<FiltroLista>;
  readonly orden: Signal<string>;
  readonly dir: Signal<Direccion>;
  readonly filtradas: Signal<T[]>;
  readonly visibles: Signal<T[]>;
  readonly total: Signal<number>;
  /** La página que se muestra (la pedida, acotada a las que existen). */
  readonly pagina: Signal<number>;
  readonly hayFiltros: Signal<boolean>;

  constructor(private readonly o: OpcionesLista<T>) {
    this.filas = o.filas;
    this.filtro = computed(() => {
      const p = this.params();
      const f = leerFiltro((n) => p.get(n), o.prefijo);
      return { ...f, estado: f.estado === TODOS ? null : (f.estado ?? o.estadoInicial ?? null) };
    });
    this.orden = computed(() => this.filtro().orden ?? o.ordenInicial?.orden ?? '');
    this.dir = computed(() => (this.filtro().orden ? this.filtro().dir : (o.ordenInicial?.dir ?? '')));
    this.filtradas = computed(() => {
      const f = this.filtro();
      return ordenar(filtrar(o.filas(), f.q, o.texto, f.estado, o.estado), o.orden?.[this.orden()], this.dir());
    });
    this.total = computed(() => this.filtradas().length);
    this.pagina = computed(() => Math.min(this.filtro().pagina, Math.max(0, Math.ceil(this.total() / this.filtro().tamano) - 1)));
    this.visibles = computed(() => paginar(this.filtradas(), this.pagina(), this.filtro().tamano));
    this.hayFiltros = computed(() => !!this.filtro().q || (this.filtro().estado ?? null) !== (o.estadoInicial ?? null));
    const memoria = inject(MemoriaListas);
    effect(() => {
      const p = this.params();
      memoria.guardar(this.router.url.split(/[?#]/)[0], Object.fromEntries(p.keys.map((k) => [k, p.get(k)])));
    });
  }

  buscar(q: string): void {
    this.ir({ q, pagina: 0 });
  }

  filtrarEstado(estado: string | null): void {
    this.ir({ estado: this.estadoEnUrl(estado), pagina: 0 });
  }

  /** Ciclo asc/desc sin "sin orden": si no, la columna del orden inicial en desc nunca podría ir en asc (C-2). */
  ordenarPor(s: Sort): void {
    this.ir({ orden: s.active, dir: s.direction || 'asc', pagina: 0 });
  }

  irAPagina(e: PageEvent): void {
    this.ir({ pagina: e.pageIndex, tamano: e.pageSize });
  }

  /** Vuelve a lo que se ve al entrar: sin búsqueda y con el estado inicial. */
  limpiar(): void {
    this.ir({ q: '', estado: null, pagina: 0 });
  }

  private estadoEnUrl(estado: string | null): string | null {
    if (!this.o.estadoInicial) return estado;
    return estado === this.o.estadoInicial ? null : (estado ?? TODOS);
  }

  /** Un filtro propio de la página que también vive en la URL (por ejemplo, "con saldo" en facturas). */
  parametro(nombre: string): Signal<string | null> {
    return computed(() => this.params().get(nombre));
  }

  /** Cambia filtros propios de la página y vuelve a la primera página. */
  poner(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { ...params, ...aParametros({ pagina: 0 }, this.o.prefijo) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private ir(cambio: Partial<FiltroLista>): void {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: aParametros(cambio, this.o.prefijo),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

export const controlLista = <T>(o: OpcionesLista<T>): ControlLista<T> => new ControlLista(o);

/** Ancho bajo el que el estado de una tabla pasa a segunda columna (RS-2). */
export const CONSULTA_ANGOSTA = '(max-width: 600px)';

/**
 * Las columnas de una tabla con el estado en segundo lugar en pantallas angostas (RS-2). Se crea en el contexto de
 * inyección del componente y sigue los cambios de ancho.
 */
export function columnasConEstado(columnas: readonly string[]): Signal<string[]> {
  const consulta = matchMedia(CONSULTA_ANGOSTA);
  const angosto = signal(consulta.matches);
  const alCambiar = (e: MediaQueryListEvent) => angosto.set(e.matches);
  consulta.addEventListener('change', alCambiar);
  inject(DestroyRef).onDestroy(() => consulta.removeEventListener('change', alCambiar));
  return computed(() => (angosto() ? estadoSegunda(columnas) : [...columnas]));
}

/** Búsqueda, filtro por estado y el número de resultados (anunciado con `role="status"`). Proyecta filtros propios. */
@Component({
  selector: 'cc-filtros-lista',
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  template: `
    <mat-form-field class="busqueda" subscriptSizing="dynamic">
      <mat-label>{{ busqueda() }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input matInput type="search" [value]="texto()" (input)="escribir($any($event.target).value)" />
    </mat-form-field>
    @if (grupo(); as g) {
      <mat-form-field class="estado" subscriptSizing="dynamic">
        <mat-label>Estado</mat-label>
        <mat-select [value]="control().filtro().estado" (valueChange)="control().filtrarEstado($event)">
          <mat-option [value]="null">Todos</mat-option>
          @for (o of opciones(); track o.valor) {
            <mat-option [value]="o.valor">{{ o.texto }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    }
    <ng-content />
    <p class="conteo" role="status">{{ conteo() }}</p>
    @if (tope(); as t) {
      <p class="tope">{{ t }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-bottom: 8px;
    }
    .busqueda {
      flex: 1 1 260px;
      max-width: 420px;
    }
    .estado {
      flex: 0 1 240px;
    }
    .conteo {
      margin: 0 0 0 auto;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .tope {
      flex: 1 1 100%;
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class FiltrosLista {
  readonly control = input.required<VistaLista>();
  /** La etiqueta visible de la búsqueda: dice por qué busca ("Buscar por placa o chofer"). */
  readonly busqueda = input('Buscar');
  readonly grupo = input<GrupoEtiqueta>();
  /** Solo estos valores del grupo, en este orden (si no, todos los del grupo). */
  readonly valores = input<readonly string[]>();
  /** Plural y singular de lo que se lista: "unidades", "unidad". */
  readonly nombre = input.required<string>();
  readonly singular = input.required<string>();
  /** Cuántas filas pide la página como máximo: si llegan todas, se dice que la lista está truncada (C-8, D-2, D-3). */
  readonly limite = input<number>();
  /** En qué orden corta el servidor: "recientes" (más nuevo primero), "antiguos" (más viejo primero) o sin orden conocido. */
  readonly corte = input<CorteServidor>(null);
  /** El filtro de estado ya lo aplicó el servidor: el "de N" solo se muestra si filtra la búsqueda (C-14). */
  readonly estadoEnServidor = input(false);
  /** Todavía no llega la primera respuesta: el conteo dice «Cargando…», no «0 viajes» (FB-4). */
  readonly cargando = input(false);
  readonly opciones = computed(() => (this.grupo() ? opcionesEstado(this.grupo()!, this.valores()) : []));
  readonly texto = signal('');
  private espera?: ReturnType<typeof setTimeout>;

  readonly conteo = computed(() => {
    const c = this.control();
    if (this.cargando() && !c.filas().length) return 'Cargando…';
    const n = c.total();
    const cuantos = `${n} ${n === 1 ? this.singular() : this.nombre()}`;
    const f = c.filtro();
    return f.q || (f.estado && !this.estadoEnServidor()) ? `${cuantos} de ${c.filas().length}` : cuantos;
  });

  readonly tope = computed(() => {
    const n = this.limite();
    if (!n || this.control().filas().length < n) return null;
    return textoTope(n, this.nombre(), this.corte(), !!this.grupo() && !this.control().filtro().estado);
  });

  constructor() {
    // Si la página se cierra antes de los 250 ms, la búsqueda pendiente no debe navegar de vuelta a la lista (C-1).
    inject(DestroyRef).onDestroy(() => clearTimeout(this.espera));
    // La URL manda (volver atrás, "Limpiar filtros"); mientras se escribe, no se pisa lo tecleado.
    effect(() => {
      const q = this.control().filtro().q;
      if (!this.espera && q !== this.texto().trim()) this.texto.set(q);
    });
  }

  escribir(valor: string): void {
    this.texto.set(valor);
    clearTimeout(this.espera);
    this.espera = setTimeout(() => {
      this.espera = undefined;
      this.control().buscar(valor);
    }, 250);
  }
}

export type CorteServidor = 'antiguos' | 'recientes' | null;

/** Qué parte de la lista llegó cuando el servidor la cortó en `n` (C-8, V1-1, V1-3). */
export function textoTope(n: number, nombre: string, corte: CorteServidor, conEstado: boolean): string {
  if (corte === 'antiguos') {
    // El servidor manda primero los más viejos: lo nuevo queda fuera y hay que decirlo (V1-1).
    const salida = conEstado ? 'filtra por estado para ver los más nuevos' : 'los más nuevos no aparecen';
    return `Se muestran los ${n} ${nombre} más antiguos; ${salida}.`;
  }
  const cuales = corte === 'recientes' ? `los ${n} ${nombre} más recientes` : `los primeros ${n} ${nombre}`;
  return `Se muestran ${cuales}; la búsqueda y el orden solo usan esos.`;
}

/** Estado vacío con siguiente paso o el paginador (en español). */
@Component({
  selector: 'cc-pie-lista',
  imports: [MatButtonModule, MatIconModule, MatPaginatorModule, Esqueleto],
  template: `
    @let c = control();
    @if (!c.total()) {
      @if (cargando()) {
        <cc-esqueleto />
      } @else if (c.hayFiltros()) {
        <div class="vacio">
          <mat-icon>search_off</mat-icon>
          <p>No hay {{ nombre() }} con ese filtro.</p>
          <button mat-button (click)="c.limpiar()"><mat-icon>filter_alt_off</mat-icon>Limpiar filtros</button>
        </div>
      } @else if (!error() && vacio()) {
        <p class="secundario vacio">{{ vacio() }}</p>
      }
    } @else if (c.total() > minimo) {
      <mat-paginator
        [length]="c.total()"
        [pageIndex]="c.pagina()"
        [pageSize]="c.filtro().tamano"
        [pageSizeOptions]="tamanos"
        [attr.aria-label]="'Páginas de ' + nombre()"
        (page)="c.irAPagina($event)"
      />
    }
  `,
  styles: `
    .vacio {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 16px 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .vacio p {
      margin: 0;
    }
  `,
})
export class PieLista {
  readonly control = input.required<VistaLista>();
  readonly nombre = input.required<string>();
  /** Qué decir si no hay nada, sin filtros ni error ("No hay entregas observadas."). */
  readonly vacio = input<string>();
  /** Si la fuente falló, lo dice `cc-aviso-servicios`; el pie no afirma que la lista está vacía. */
  readonly error = input<unknown>();
  /** Todavía no llega la primera respuesta: esqueleto, no "no hay". */
  readonly cargando = input(false);
  readonly tamanos = TAMANOS_PAGINA;
  readonly minimo = TAMANOS_PAGINA[0];
}

/** Textos del paginador en español; se provee en `configurarApp`. */
@Injectable()
export class PaginadorEs extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Filas por página';
  override nextPageLabel = 'Página siguiente';
  override previousPageLabel = 'Página anterior';
  override firstPageLabel = 'Primera página';
  override lastPageLabel = 'Última página';
  override getRangeLabel = (pagina: number, tamano: number, total: number): string => {
    if (!total) return '0 de 0';
    const desde = pagina * tamano;
    return `${desde + 1} a ${Math.min(desde + tamano, total)} de ${total}`;
  };
}
