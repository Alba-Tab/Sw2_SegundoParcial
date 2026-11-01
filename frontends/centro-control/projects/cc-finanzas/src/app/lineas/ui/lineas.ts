import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  aCentavos,
  AvisoServicios,
  BobPipe,
  controlLista,
  Encabezado,
  Estado,
  FiltrosLista,
  LIMITE_GATEWAY,
  PieLista,
  posicionEstado,
} from 'ui-comun';
import { estadoLinea, textoLinea } from '../domain/linea';
import { LineasFachada } from '../lineas.fachada';

/** G6: la línea de crédito de cada cliente. El nombre lleva a sus facturas. */
@Component({
  selector: 'app-lineas',
  providers: [LineasFachada],
  imports: [Encabezado, MatIconModule, MatTableModule, MatSortModule, RouterLink, BobPipe, Estado, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado titulo="Líneas de crédito" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!lineas().length || incompletas() > 0" />
    @if (incompletas(); as n) {
      <p class="aviso-lista" role="status">
        <mat-icon>cloud_off</mat-icon>No se pudo leer la línea de {{ n }} {{ n === 1 ? 'cliente' : 'clientes' }}: la lista está incompleta.
      </p>
    }
    @if (clientesLeidos() >= limiteClientes) {
      <p class="secundario">Se revisan los primeros {{ limiteClientes }} clientes: si hay más, sus líneas no salen aquí.</p>
    }
    <cc-filtros-lista
      [control]="lista"
      busqueda="Buscar por razón social o NIT"
      grupo="EstadoLineaCredito"
      nombre="líneas"
      singular="línea"
    />
    <div class="tabla-ancha">
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
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let c; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="líneas de crédito"
      vacio="Ningún cliente tiene línea de crédito."
      [error]="error()"
      [cargando]="cargando()"
    />
  `,
})
export class LineasPagina {
  private readonly fachada = inject(LineasFachada);
  readonly lineas = this.fachada.lineas;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly incompletas = this.fachada.incompletas;
  readonly clientesLeidos = this.fachada.clientesLeidos;
  readonly limiteClientes = LIMITE_GATEWAY;
  readonly campos = { clientes: 'Viajes', lineaCredito: 'Finanzas' };
  readonly columnas = ['cliente', 'limite', 'reservado', 'utilizado', 'disponible', 'estado'];
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
}
