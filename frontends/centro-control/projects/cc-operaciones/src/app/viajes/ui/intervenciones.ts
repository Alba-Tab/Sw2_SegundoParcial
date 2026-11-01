import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AvisoServicios, controlLista, Encabezado, FechaPipe, FiltrosLista, PieLista, Sesion } from 'ui-comun';
import { textoViaje } from '../domain/viaje';
import { IntervencionesFachada } from '../viajes.fachada';

/** Spec 011: viajes cuya compensación se agotó; el despachador reintenta o marca resuelto en el detalle. */
@Component({
  selector: 'app-intervenciones',
  providers: [IntervencionesFachada],
  imports: [
    Encabezado,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    FechaPipe,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado
      titulo="Intervenciones"
      subtitulo="La cancelación automática no terminó (reserva o crédito sin liberar): reintenta o márcalo resuelto en el viaje"
    />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!lista.filas().length" />
    <cc-filtros-lista
      [control]="lista"
      busqueda="Buscar por placa, cliente, ruta o motivo"
      nombre="intervenciones"
      singular="intervención"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Intervenciones">
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
          <td mat-cell *matCellDef="let v">{{ v.placa ?? 'Sin unidad' }}</td></ng-container
        >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Cliente</th>
          <td mat-cell *matCellDef="let v">{{ v.cliente?.razonSocial }}</td></ng-container
        >
        <ng-container matColumnDef="ruta"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Ruta</th>
          <td mat-cell *matCellDef="let v">{{ v.ruta?.nombre }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Fecha</th>
          <td mat-cell *matCellDef="let v">{{ v.fechaViaje | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="motivo"
          ><th mat-header-cell *matHeaderCellDef>Motivo</th>
          <td mat-cell *matCellDef="let v">{{ v.motivo }}</td></ng-container
        >
        <ng-container matColumnDef="accion"
          ><th mat-header-cell *matHeaderCellDef><span class="cdk-visually-hidden">Acción</span></th>
          <td mat-cell *matCellDef="let v">
            <!-- Solo el despachador resuelve en el viaje; los demás roles lo ven (V1-4). -->
            @if (decide) {
              <a mat-stroked-button [routerLink]="['/viajes', v.viajeId]" [queryParams]="{ de: 'intervenciones' }"
                ><mat-icon>rule</mat-icon>Resolver</a
              >
            } @else {
              <a mat-stroked-button [routerLink]="['/viajes', v.viajeId]" [queryParams]="{ de: 'intervenciones' }">Ver detalle</a>
            }
          </td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let v; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="intervenciones"
      vacio="No hay viajes que requieran intervención."
      [error]="error()"
      [cargando]="cargando()"
    />
  `,
})
export class IntervencionesPagina {
  private readonly fachada = inject(IntervencionesFachada);
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly decide = inject(Sesion).tiene('despachador');
  readonly campos = { intervenciones: 'Viajes' };
  readonly columnas = ['placa', 'cliente', 'ruta', 'fecha', 'motivo', 'accion'];
  readonly lista = controlLista({
    filas: computed(() => this.fachada.datos()?.data?.intervenciones ?? []),
    texto: (v) => `${textoViaje(v)} ${v.motivo ?? ''}`,
    orden: {
      placa: (v) => v.placa,
      cliente: (v) => v.cliente?.razonSocial,
      ruta: (v) => v.ruta?.nombre,
      fecha: (v) => v.fechaViaje,
    },
    ordenInicial: { orden: 'fecha', dir: 'asc' },
  });
}
