import { Component, computed, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { aCentavos, BobPipe, FechaPipe, pct, sumarMontos } from './formato';

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

/**
 * Tabla y gráfico de un reporte (spec 015): los números vienen calculados de Analítica; aquí solo se dibujan. Barras en
 * SVG con los colores del tema (sin otra librería).
 */
@Component({
  selector: 'cc-tabla-reporte',
  imports: [MatTableModule, FechaPipe],
  template: `
    @let r = resultado();
    <p class="datos-al">Datos al {{ r.datosAl ? (r.datosAl | fecha: true) : '—' }}</p>
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
    <div class="tabla">
      <table mat-table [dataSource]="r.filas">
        @for (c of r.columnas; track c.clave) {
          <ng-container [matColumnDef]="c.clave">
            <th mat-header-cell *matHeaderCellDef [class.numero]="numerica(c)">{{ c.titulo }}</th>
            <td mat-cell *matCellDef="let f" [class.numero]="numerica(c)">{{ celda(f[c.clave], c) }}</td>
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
        <p class="vacio">Sin datos para estos parámetros.</p>
      }
    </div>
  `,
  styles: `
    .datos-al {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
      margin: 0 0 8px;
    }
    .grafico {
      width: 100%;
      max-height: 360px;
      margin-bottom: 16px;
    }
    .etiqueta,
    .valor {
      font-size: 12px;
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
  readonly ancho = 720;
  private readonly bob = new BobPipe();
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
    if (valor === null || valor === undefined || valor === '') return '—';
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
        return Number(valor).toLocaleString('es-BO', { maximumFractionDigits: 2 });
      default:
        return String(valor);
    }
  }
}
