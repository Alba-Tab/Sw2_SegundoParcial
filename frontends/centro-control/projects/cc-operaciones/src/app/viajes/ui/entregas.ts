import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AvisoServicios, controlLista, Encabezado, EtiquetaPipe, FechaPipe, FiltrosLista, PieLista, Sesion } from 'ui-comun';
import { textoViaje } from '../domain/viaje';
import { EntregasFachada } from '../viajes.fachada';

/** Spec 007: entregas fuera de la geocerca o sin firma, para aprobar o rechazar en el detalle del viaje. */
@Component({
  selector: 'app-entregas',
  providers: [EntregasFachada],
  imports: [
    Encabezado,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    FechaPipe,
    EtiquetaPipe,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Entregas observadas" subtitulo="Fuera de la geocerca o sin firma: apruébalas o recházalas en el viaje" />
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!lista.filas().length" />
    <cc-filtros-lista [control]="lista" busqueda="Buscar por placa, cliente, ruta o chofer" nombre="entregas" singular="entrega" />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Entregas observadas">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Placa</th>
          <td mat-cell *matCellDef="let v">{{ v.placa }}</td></ng-container
        >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Cliente</th>
          <td mat-cell *matCellDef="let v">{{ v.cliente?.razonSocial }}</td></ng-container
        >
        <ng-container matColumnDef="ruta"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Ruta</th>
          <td mat-cell *matCellDef="let v">{{ v.ruta?.nombre }}</td></ng-container
        >
        <ng-container matColumnDef="registrada"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Registrada</th>
          <td mat-cell *matCellDef="let v">{{ v.entrega?.registradaEn | fecha: true }}</td></ng-container
        >
        <ng-container matColumnDef="distancia"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Distancia al destino</th>
          <td mat-cell *matCellDef="let v">{{ v.entrega?.distanciaMetros }} m</td></ng-container
        >
        <ng-container matColumnDef="observacion"
          ><th mat-header-cell *matHeaderCellDef>Observación</th>
          <td mat-cell *matCellDef="let v">
            <!-- Sin firma ya viene como razón (SIN_FIRMA): "Con firma" solo si no hay ninguna (V1-7). -->
            @for (razon of v.entrega?.razones ?? []; track razon) {
              {{ razon | etiqueta: 'RazonObservacion' }}{{ $last ? '' : ' · ' }}
            } @empty {
              {{ v.entrega?.conFirma ? 'Con firma' : 'Sin firma' }}
            }
          </td></ng-container
        >
        <ng-container matColumnDef="accion"
          ><th mat-header-cell *matHeaderCellDef><span class="cdk-visually-hidden">Acción</span></th>
          <td mat-cell *matCellDef="let v">
            <!-- Solo el despachador decide en el viaje; los demás roles lo ven (V1-4). -->
            @if (decide) {
              <a mat-stroked-button [routerLink]="['/viajes', v.viajeId]" [queryParams]="{ de: 'entregas-observadas' }"
                ><mat-icon>rule</mat-icon>Revisar y decidir</a
              >
            } @else {
              <a mat-stroked-button [routerLink]="['/viajes', v.viajeId]" [queryParams]="{ de: 'entregas-observadas' }">Ver detalle</a>
            }
          </td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let v; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="entregas observadas"
      vacio="No hay entregas observadas."
      [error]="error()"
      [cargando]="cargando()"
    />
  `,
})
export class EntregasPagina {
  private readonly fachada = inject(EntregasFachada);
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly decide = inject(Sesion).tiene('despachador');
  readonly campos = { entregasObservadas: 'Viajes' };
  readonly columnas = ['placa', 'cliente', 'ruta', 'registrada', 'distancia', 'observacion', 'accion'];
  readonly lista = controlLista({
    filas: computed(() => this.fachada.datos()?.data?.entregasObservadas ?? []),
    texto: textoViaje,
    orden: {
      placa: (v) => v.placa,
      cliente: (v) => v.cliente?.razonSocial,
      ruta: (v) => v.ruta?.nombre,
      registrada: (v) => v.entrega?.registradaEn,
      distancia: (v) => v.entrega?.distanciaMetros,
    },
    ordenInicial: { orden: 'registrada', dir: 'asc' },
  });
}
