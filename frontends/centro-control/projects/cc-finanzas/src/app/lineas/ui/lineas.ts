import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  aCentavos,
  AvisoServicios,
  BobPipe,
  columnasConEstado,
  controlLista,
  Encabezado,
  enfocar,
  Estado,
  FiltrosLista,
  mensajeDe,
  PieLista,
  posicionEstado,
} from 'ui-comun';
import { estadoLinea, textoLinea } from '../domain/linea';
import { LineasFachada } from '../lineas.fachada';
import { GestionLinea } from './gestion-linea';

/** G6: la línea de crédito de cada cliente. El nombre lleva a sus facturas; «Gestionar» ajusta el límite o la suspende. */
@Component({
  selector: 'app-lineas',
  providers: [LineasFachada],
  imports: [
    Encabezado,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    BobPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
    GestionLinea,
  ],
  template: `
    <cc-encabezado titulo="Líneas de crédito" />
    <!-- Las líneas que faltan se dicen una vez, en el mismo aviso y con su «Reintentar» (V1-11, V3-7). -->
    <cc-aviso-servicios
      [error]="error()"
      [datosAl]="datosAl()"
      [campos]="campos"
      [sinDatos]="!lineas().length"
      [extra]="avisoIncompletas()"
    />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargando()"
      busqueda="Buscar por razón social o NIT"
      grupo="EstadoLineaCredito"
      nombre="líneas"
      singular="línea"
    />
    @if (seleccionado(); as c) {
      <app-gestion-linea [cliente]="c" (cerrar)="cerrarGestion()" />
    }
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Líneas de crédito">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Cliente</th>
          <td mat-cell *matCellDef="let c">
            <a [routerLink]="['/facturas']" [queryParams]="{ q: c.razonSocial }"
              >{{ c.razonSocial }} <span class="cdk-visually-hidden">(ver sus facturas)</span></a
            >
          </td></ng-container
        >
        <ng-container matColumnDef="limite"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Límite</th>
          <td mat-cell *matCellDef="let c">{{ c.lineaCredito.limite | bob }}</td></ng-container
        >
        <ng-container matColumnDef="reservado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Reservado</th>
          <td mat-cell *matCellDef="let c">{{ c.lineaCredito.reservado | bob }}</td></ng-container
        >
        <ng-container matColumnDef="utilizado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Utilizado</th>
          <td mat-cell *matCellDef="let c">{{ c.lineaCredito.utilizado | bob }}</td></ng-container
        >
        <ng-container matColumnDef="disponible"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Disponible</th>
          <td mat-cell *matCellDef="let c">{{ c.lineaCredito.disponible | bob }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let c"><cc-estado grupo="EstadoLineaCredito" [valor]="estado(c)" /></td
        ></ng-container>
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef><span class="cdk-visually-hidden">Acciones</span></th>
          <td mat-cell *matCellDef="let c">
            <button
              mat-button
              [id]="'gestionar-' + c.clienteId"
              (click)="gestionar(c.clienteId)"
              [attr.aria-expanded]="gestionando() === c.clienteId"
              aria-controls="gestion-linea"
            >
              <mat-icon>credit_card</mat-icon>Gestionar <span class="cdk-visually-hidden">la línea de {{ c.razonSocial }}</span>
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
        <tr mat-row *matRowDef="let c; columns: columnas()"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="líneas de crédito"
      vacio="Ningún cliente tiene línea de crédito."
      [error]="error()"
      [cargando]="cargando()"
    />
    @if (paginas.siguienteCursor()) {
      <!-- E5-1: la búsqueda y el orden usan solo los clientes ya cargados. -->
      <p class="secundario">Hay más clientes; la búsqueda y el orden solo usan las líneas ya cargadas.</p>
      @if (paginas.error(); as e) {
        <p class="aviso-lista" role="alert">No se pudieron cargar más clientes. {{ mensaje(e) }}</p>
      }
      <button mat-stroked-button (click)="paginas.cargarMas()" [disabled]="paginas.cargandoMas()" disabledInteractive>
        {{ paginas.error() ? 'Reintentar' : 'Cargar más clientes' }}
      </button>
    }
  `,
})
export class LineasPagina {
  private readonly fachada = inject(LineasFachada);
  readonly lineas = this.fachada.lineas;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly avisoIncompletas = computed(() => {
    const n = this.fachada.incompletas();
    return n ? `No se pudo leer la línea de ${n} ${n === 1 ? 'cliente' : 'clientes'}: la lista está incompleta.` : null;
  });
  readonly paginas = this.fachada.paginas;
  readonly mensaje = mensajeDe;
  /** Una línea caída la cuenta el aviso de la lista: sin banner repetido (V1-11). */
  readonly campos = { clientes: 'Viajes', lineaCredito: '' };
  readonly columnas = columnasConEstado(['cliente', 'limite', 'reservado', 'utilizado', 'disponible', 'estado', 'acciones']);
  /** El cliente cuya línea se está gestionando; el panel se abre arriba de la tabla (una a la vez). */
  readonly gestionando = signal<string | null>(null);
  readonly seleccionado = computed(() => this.lineas().find((c) => c.clienteId === this.gestionando()));
  readonly estado = estadoLinea;
  readonly lista = controlLista({
    filas: this.lineas,
    texto: textoLinea,
    estado: estadoLinea,
    orden: {
      cliente: (c) => c.razonSocial,
      limite: (c) => aCentavos(c.lineaCredito.limite),
      reservado: (c) => aCentavos(c.lineaCredito.reservado),
      utilizado: (c) => aCentavos(c.lineaCredito.utilizado),
      disponible: (c) => aCentavos(c.lineaCredito.disponible),
      estado: (c) => posicionEstado('EstadoLineaCredito', estadoLinea(c)),
    },
    ordenInicial: { orden: 'disponible', dir: 'asc' },
  });

  /** Abre el panel de esa línea (o lo cierra si ya estaba abierto). */
  gestionar(clienteId: string): void {
    if (this.gestionando() === clienteId) return this.cerrarGestion();
    this.gestionando.set(clienteId);
  }

  /** Cierra el panel y devuelve el foco al «Gestionar» de esa fila. */
  cerrarGestion(): void {
    const id = this.gestionando();
    this.gestionando.set(null);
    if (id) enfocar(`gestionar-${id}`);
  }
}
