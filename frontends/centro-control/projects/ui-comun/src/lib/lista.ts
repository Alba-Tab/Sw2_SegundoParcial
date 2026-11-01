import { Component, computed, effect, inject, Injectable, input, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import type { Sort } from '@angular/material/sort';
import { ActivatedRoute, Router } from '@angular/router';
import { Esqueleto } from './esqueleto';
import {
  aParametros,
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
}

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
      return leerFiltro((n) => p.get(n), o.prefijo);
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
    this.hayFiltros = computed(() => !!this.filtro().q || !!this.filtro().estado);
  }

  buscar(q: string): void {
    this.ir({ q, pagina: 0 });
  }

  filtrarEstado(estado: string | null): void {
    this.ir({ estado, pagina: 0 });
  }

  ordenarPor(s: Sort): void {
    this.ir({ orden: s.direction ? s.active : null, dir: s.direction, pagina: 0 });
  }

  irAPagina(e: PageEvent): void {
    this.ir({ pagina: e.pageIndex, tamano: e.pageSize });
  }

  limpiar(): void {
    this.ir({ q: '', estado: null, pagina: 0 });
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
  readonly opciones = computed(() => (this.grupo() ? opcionesEstado(this.grupo()!, this.valores()) : []));
  readonly texto = signal('');
  private espera?: ReturnType<typeof setTimeout>;

  readonly conteo = computed(() => {
    const c = this.control();
    const n = c.total();
    const cuantos = `${n} ${n === 1 ? this.singular() : this.nombre()}`;
    return c.hayFiltros() ? `${cuantos} de ${c.filas().length}` : cuantos;
  });

  constructor() {
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
