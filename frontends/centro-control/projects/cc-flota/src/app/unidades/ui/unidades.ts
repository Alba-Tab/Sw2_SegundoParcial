import { Component, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  controlLista,
  Encabezado,
  Estado,
  etiqueta,
  EtiquetaPipe,
  FechaPipe,
  FiltrosLista,
  PieLista,
  posicionEstado,
  vigencia,
  NumeroPipe,
} from 'ui-comun';
import { AVISO_KM, textoUnidad, type Unidad } from '../domain/unidad';
import { UnidadesFachada } from '../unidades.fachada';

@Component({
  selector: 'app-unidades',
  providers: [UnidadesFachada],
  imports: [
    Encabezado,
    MatTableModule,
    MatSortModule,
    RouterLink,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    NumeroPipe,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Unidades" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!unidades().length" />
    <cc-filtros-lista [control]="lista" busqueda="Buscar por placa o tipo" grupo="EstadoUnidad" nombre="unidades" singular="unidad" />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Unidades">
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
          <td mat-cell *matCellDef="let u">
            <a [routerLink]="['/unidades', u.unidadId]">{{ u.placa }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="tipo"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
          <td mat-cell *matCellDef="let u">
            {{ u.tipoUnidad | etiqueta: 'TipoUnidad' }} {{ u.tipoRemolque ? (u.tipoRemolque | etiqueta: 'TipoRemolque') : '' }}
          </td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let u">
            <cc-estado grupo="EstadoUnidad" [valor]="u.estado" /></td
        ></ng-container>
        <ng-container matColumnDef="km"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Km desde el mantenimiento</th>
          <td mat-cell *matCellDef="let u" [class.no-disponible]="u.kmDesdeUltimoMantenimiento >= avisoKm">
            {{ u.kmDesdeUltimoMantenimiento | numero }}
          </td></ng-container
        >
        <ng-container matColumnDef="documentos"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Documentos</th>
          <td mat-cell *matCellDef="let u">
            @for (d of u.documentos; track d.tipo) {
              <span class="secundario">{{ d.tipo | etiqueta: 'TipoDocumento' }} {{ d.venceEl | fecha }} </span>
              @if (vigencia(d.venceEl) !== 'VIGENTE') {
                <cc-estado grupo="Vigencia" [valor]="vigencia(d.venceEl)" />
              }
            }</td
        ></ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let u; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="unidades" vacio="No hay unidades registradas." [error]="error()" [cargando]="cargando()" />
  `,
})
export class UnidadesPagina {
  private readonly fachada = inject(UnidadesFachada);
  readonly unidades = this.fachada.unidades;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { unidades: 'Flota' };
  readonly columnas = ['placa', 'tipo', 'estado', 'km', 'documentos'];
  readonly avisoKm = AVISO_KM;
  readonly vigencia = (venceEl: string) => vigencia(venceEl);
  readonly lista = controlLista<Unidad>({
    filas: this.unidades,
    texto: textoUnidad,
    estado: (u) => u.estado,
    orden: {
      placa: (u) => u.placa,
      tipo: (u) => etiqueta('TipoUnidad', u.tipoUnidad).texto,
      estado: (u) => posicionEstado('EstadoUnidad', u.estado),
      km: (u) => u.kmDesdeUltimoMantenimiento,
      // El documento que vence primero.
      documentos: (u) => u.documentos.map((d) => d.venceEl).sort()[0],
    },
    ordenInicial: { orden: 'placa', dir: 'asc' },
  });
}
