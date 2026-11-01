import { Component, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import {
  aCentavos,
  AvisoServicios,
  BobPipe,
  controlLista,
  Encabezado,
  Estado,
  etiqueta,
  EtiquetaPipe,
  FechaPipe,
  FiltrosLista,
  PieLista,
} from 'ui-comun';
import { CotizacionesFachada } from '../cotizaciones.fachada';
import { estadoCotizacion } from '../domain/cotizacion';

@Component({
  selector: 'app-cotizaciones',
  providers: [CotizacionesFachada],
  imports: [Encabezado, MatTableModule, MatSortModule, BobPipe, FechaPipe, EtiquetaPipe, Estado, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado titulo="Cotizaciones" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!cotizaciones().length" />
    <cc-filtros-lista
      [control]="lista"
      busqueda="Buscar por cliente, ruta o carga"
      grupo="EstadoCotizacion"
      nombre="cotizaciones"
      singular="cotización"
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
          <td mat-cell *matCellDef="let c">{{ nombre(c.clienteId) }}</td></ng-container
        >
        <ng-container matColumnDef="ruta"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Ruta</th>
          <td mat-cell *matCellDef="let c">{{ ruta(c.rutaId) }}</td></ng-container
        >
        <ng-container matColumnDef="carga"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Carga</th>
          <td mat-cell *matCellDef="let c">{{ c.tipoCarga | etiqueta: 'TipoCarga' }} · {{ c.toneladas }} t</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Monto</th>
          <td mat-cell *matCellDef="let c">{{ c.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let c">
            <cc-estado grupo="EstadoCotizacion" [valor]="estado(c)" /></td
        ></ng-container>
        <ng-container matColumnDef="creada"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Creada</th>
          <td mat-cell *matCellDef="let c">{{ c.creadaEn | fecha: true }} · {{ c.canal | etiqueta: 'CanalCotizacion' }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let c; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="cotizaciones" vacio="No hay cotizaciones." [error]="error()" />
  `,
})
export class CotizacionesPagina {
  private readonly fachada = inject(CotizacionesFachada);
  readonly cotizaciones = this.fachada.cotizaciones;
  readonly error = this.fachada.error;
  readonly campos = { cotizaciones: 'Finanzas', clientes: 'Viajes', rutas: 'Viajes' };
  readonly estado = estadoCotizacion;
  readonly columnas = ['cliente', 'ruta', 'carga', 'monto', 'estado', 'creada'];
  nombre = (id: string) => this.fachada.nombreCliente(id);
  ruta = (id: string) => this.fachada.nombreRuta(id);
  readonly lista = controlLista({
    filas: this.cotizaciones,
    texto: (c) => [this.nombre(c.clienteId), this.ruta(c.rutaId), etiqueta('TipoCarga', c.tipoCarga).texto].join(' '),
    estado: estadoCotizacion,
    orden: {
      cliente: (c) => this.nombre(c.clienteId),
      ruta: (c) => this.ruta(c.rutaId),
      carga: (c) => etiqueta('TipoCarga', c.tipoCarga).texto,
      monto: (c) => aCentavos(c.monto),
      estado: (c) => etiqueta('EstadoCotizacion', estadoCotizacion(c)).texto,
      creada: (c) => c.creadaEn,
    },
    ordenInicial: { orden: 'creada', dir: 'desc' },
  });
}
