import { Component, computed, inject, input, signal } from '@angular/core';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { aCentavos, conDesde, type Direccion, numero, ordenar, pct, SIN_DATO, sumarMontos } from 'ui-comun/dominio';
import { CONFIG_CENTRO } from './configuracion';
import { Estado } from './estado';
import { BobPipe, FechaPipe } from './formato';

export interface Columna {
  clave: string;
  titulo: string;
  tipo: string;
}
export interface Resultado {
  titulo: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  totales: Record<string, unknown>;
  grafico: { tipo: string; ejeX: string; series: { clave: string; titulo: string }[]; datos?: Record<string, unknown>[] };
  datosAl?: string | null;
}

/** El valor de una celda para ordenar: los montos en centavos (sin float), los números como número y lo demás como texto. */
export function valorParaOrden(valor: unknown, tipo: string): string | number | bigint | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (tipo === 'MONTO') return aCentavos(String(valor));
  if (tipo === 'NUMERO' || tipo === 'PORCENTAJE') return Number(valor);
  return String(valor);
}

/** Las filas de un reporte ordenadas por una columna; los totales no cambian (son de todas las filas). */
export function ordenarFilas(filas: readonly Record<string, unknown>[], columna: Columna | undefined, dir: Direccion) {
  return ordenar(filas, columna ? (f) => valorParaOrden(f[columna.clave], columna.tipo) : undefined, dir);
}

/**
 * Tabla y gráfico de un reporte (spec 015): los números vienen calculados de Analítica; aquí solo se dibujan. Barras en
 * SVG con los colores del tema (sin otra librería).
 */
@Component({
  selector: 'cc-tabla-reporte',
  imports: [MatTableModule, MatSortModule, RouterLink, FechaPipe, Estado],
  template: `
    @let r = resultado();
    @if (r.datosAl) {
      <p class="datos-al">Datos al {{ r.datosAl | fecha: true }}</p>
    }
    @if (barras().length) {
      <svg class="grafico" [attr.viewBox]="'0 0 ' + ancho + ' ' + (barras().length * 28 + 8)" role="img" [attr.aria-label]="r.titulo">
        @for (b of barras(); track b.etiqueta; let i = $index) {
          <text [attr.x]="0" [attr.y]="i * 28 + 20" class="etiqueta">{{ b.etiqueta }}</text>
          @for (s of b.segmentos; track s.serie; let j = $index) {
            <rect [attr.x]="160 + s.desde" [attr.y]="i * 28 + 6" [attr.width]="s.ancho" height="18" [attr.class]="'serie-' + j" rx="3">
              <title>{{ s.serie }}: {{ s.texto }}</title>
            </rect>
          }
          <text [attr.x]="168 + b.total" [attr.y]="i * 28 + 20" class="valor">{{ b.texto }}</text>
        }
      </svg>
    }
    <div class="tabla" role="region" tabindex="0" [attr.aria-label]="r.titulo">
      <!-- Ordenar es local y no toca los totales: siguen siendo los de todas las filas. -->
      <table mat-table [dataSource]="filas()" matSort (matSortChange)="orden.set($event)">
        @for (c of r.columnas; track c.clave) {
          <ng-container [matColumnDef]="c.clave">
            <!-- Los montos van sin «BOB» en cada celda: la moneda la dice el encabezado (NG-2). -->
            <th mat-header-cell *matHeaderCellDef mat-sort-header [class.numero]="numerica(c)">
              {{ c.titulo }}{{ c.tipo === 'MONTO' ? ' (BOB)' : '' }}
            </th>
            <td mat-cell *matCellDef="let f" [class.numero]="numerica(c)">
              @if (c.clave === 'factura' && f['facturaId']) {
                @if (config?.app === 'cc-finanzas') {
                  <a class="sin-corte" [routerLink]="['/facturas', f['facturaId']]">{{ celda(f[c.clave], c) }}</a>
                } @else if (config) {
                  <a class="sin-corte" [href]="urlFactura(f['facturaId'])">{{ celda(f[c.clave], c) }}</a>
                } @else {
                  {{ celda(f[c.clave], c) }}
                }
              } @else if (c.clave === 'vencida' && c.tipo === 'BOOLEANO') {
                <!-- Vencida y por vencer se separan con texto, ícono y tono, no con «Sí»/«No» (NG-2). -->
                <cc-estado
                  grupo="Vigencia"
                  [valor]="f[c.clave] ? 'VENCIDO' : 'POR_VENCER'"
                  [texto]="f[c.clave] ? 'Vencida' : 'Por vencer'"
                />
              } @else {
                {{ celda(f[c.clave], c) }}
              }
            </td>
            <td mat-footer-cell *matFooterCellDef [class.numero]="numerica(c)">
              {{ $first ? 'Total' : r.totales[c.clave] !== undefined ? celda(r.totales[c.clave], c) : '' }}
            </td>
          </ng-container>
        }
        <tr mat-header-row *matHeaderRowDef="claves()"></tr>
        <tr mat-row *matRowDef="let f; columns: claves()"></tr>
        <tr mat-footer-row *matFooterRowDef="claves()"></tr>
      </table>
      @if (!r.filas.length) {
        <p class="vacio">{{ vacio() }}</p>
      }
    </div>
  `,
  styles: `
    .datos-al {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
      margin: 0 0 8px;
    }
    .grafico {
      width: 100%;
      max-height: 360px;
      margin-bottom: 16px;
    }
    .etiqueta,
    .valor {
      font: var(--mat-sys-body-small);
      fill: var(--mat-sys-on-surface);
    }
    .serie-0 {
      fill: var(--mat-sys-primary);
    }
    .serie-1 {
      fill: var(--mat-sys-tertiary);
    }
    .tabla {
      overflow-x: auto;
    }
    .numero {
      text-align: right;
    }
    .vacio {
      padding: 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TablaReporte {
  readonly resultado = input.required<Resultado>();
  /** El texto sin filas (una búsqueda sin coincidencias dice otra cosa que un reporte vacío). */
  readonly vacio = input('Sin datos para estos parámetros.');
  readonly orden = signal<Sort>({ active: '', direction: '' });
  readonly filas = computed(() => {
    const { filas, columnas } = this.resultado();
    const { active, direction } = this.orden();
    return ordenarFilas(
      filas,
      columnas.find((c) => c.clave === active),
      direction,
    );
  });
  readonly ancho = 720;
  readonly config = inject(CONFIG_CENTRO, { optional: true });
  private readonly bob = new BobPipe();

  /** La factura de una fila de cuentas por cobrar se abre en Finanzas, con «Volver» a la app de origen. */
  urlFactura(facturaId: unknown): string {
    return conDesde(`${this.config!.urls['cc-finanzas']}/facturas/${String(facturaId)}`, this.config!.app);
  }
  private readonly fecha = new FechaPipe();

  readonly claves = computed(() => this.resultado().columnas.map((c) => c.clave));

  readonly barras = computed(() => {
    const { grafico, filas, columnas } = this.resultado();
    const datos = grafico.datos ?? filas;
    const tipoSerie = columnas.find((c) => c.clave === grafico.series[0]?.clave)?.tipo ?? 'NUMERO';
    // Number solo para el largo de las barras (dibujo); el texto de los montos se calcula en centavos enteros.
    const valores = datos.map((d) => grafico.series.map((s) => Number(d[s.clave] ?? 0)));
    const maximo = Math.max(1, ...valores.map((v) => v.reduce((a, b) => a + Math.max(0, b), 0)));
    const escala = (this.ancho - 260) / maximo;
    return datos.slice(0, 15).map((d, i) => {
      let desde = 0;
      const segmentos = grafico.series.map((s, j) => {
        const ancho = Math.max(0, valores[i][j]) * escala;
        const seg = { serie: s.titulo, desde, ancho, texto: this.celda(d[s.clave], { clave: s.clave, titulo: s.titulo, tipo: tipoSerie }) };
        desde += ancho;
        return seg;
      });
      const total = valores[i].reduce((a, b) => a + Math.max(0, b), 0);
      return {
        etiqueta: String(d[grafico.ejeX] ?? '').slice(0, 24),
        segmentos,
        total: total * escala,
        texto: this.celda(grafico.series.length > 1 ? this.totalSeries(d, grafico.series, tipoSerie, total) : d[grafico.series[0].clave], {
          clave: '',
          titulo: '',
          tipo: tipoSerie,
        }),
      };
    });
  });

  /** Total de la barra apilada (solo las partes positivas, como se dibujan); si es dinero, sin float. */
  private totalSeries(d: Record<string, unknown>, series: { clave: string }[], tipo: string, total: number): string {
    if (tipo !== 'MONTO') return total.toFixed(2);
    return sumarMontos(series.map((s) => d[s.clave]).filter((v) => (aCentavos(String(v ?? '0')) ?? 0n) > 0n));
  }

  numerica(c: Columna): boolean {
    return ['MONTO', 'NUMERO', 'PORCENTAJE'].includes(c.tipo);
  }

  celda(valor: unknown, c: Columna): string {
    if (valor === null || valor === undefined || valor === '') return SIN_DATO;
    switch (c.tipo) {
      case 'MONTO':
        return this.bob.transform(String(valor), false);
      case 'PORCENTAJE':
        return pct(Number(valor));
      case 'FECHA':
        return this.fecha.transform(String(valor));
      case 'INSTANTE':
        return this.fecha.transform(String(valor), true);
      case 'BOOLEANO':
        return valor ? 'Sí' : 'No';
      case 'NUMERO':
        return numero(valor as number | string);
      default:
        return String(valor);
    }
  }
}
