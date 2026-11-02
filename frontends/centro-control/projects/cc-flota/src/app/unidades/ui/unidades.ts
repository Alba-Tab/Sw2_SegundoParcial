import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  columnasConEstado,
  controlLista,
  Encabezado,
  Estado,
  etiqueta,
  EtiquetaPipe,
  FechaPipe,
  FiltrosLista,
  PieLista,
  posicionEstado,
  Sesion,
  vigencia,
  NumeroPipe,
} from 'ui-comun';
import { AVISO_KM, textoUnidad, urgenciaUnidad, type Unidad } from '../domain/unidad';
import { UnidadesFachada } from '../unidades.fachada';

@Component({
  selector: 'app-unidades',
  providers: [UnidadesFachada],
  imports: [
    MatButtonModule,
    MatIconModule,
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
    <cc-encabezado titulo="Unidades">
      @if (sesion.tiene('jefe_flota')) {
        <a mat-stroked-button routerLink="/unidades/nueva"><mat-icon>local_shipping</mat-icon>Nueva unidad</a>
      } @else {
        <!-- P8: lo que el rol no hace dice quién lo hace, en vez de callar. -->
        <span class="secundario"><mat-icon class="icono-en-linea">lock_person</mat-icon>Las unidades las da de alta el jefe de flota.</span>
      }
    </cc-encabezado>
    <cc-aviso-servicios [error]="error()" [datosAl]="datosAl()" [campos]="campos" [sinDatos]="!unidades().length" />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargando()"
      busqueda="Buscar por placa o tipo"
      grupo="EstadoUnidad"
      nombre="unidades"
      singular="unidad"
    />
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
            <!-- Cerca del mantenimiento: ícono y texto además del color (JV-1). -->
            @if (u.kmDesdeUltimoMantenimiento >= avisoKm) {
              <mat-icon class="icono-en-linea">warning</mat-icon>
            }
            {{ u.kmDesdeUltimoMantenimiento | numero }}
            @if (u.kmDesdeUltimoMantenimiento >= avisoKm) {
              <span class="cdk-visually-hidden">, cerca del mantenimiento</span>
            }
          </td></ng-container
        >
        <ng-container matColumnDef="documentos"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Documentos</th>
          <td mat-cell *matCellDef="let u">
            @for (d of u.documentos; track d.tipo) {
              <!-- Un documento por línea (P1): «SOAT 01/04/2027» no se mezcla con el siguiente. -->
              <div class="documento">
                <span class="secundario">{{ d.tipo | etiqueta: 'TipoDocumento' }} {{ d.venceEl | fecha }}</span>
                @if (vigencia(d.venceEl) !== 'VIGENTE') {
                  <cc-estado grupo="Vigencia" [valor]="vigencia(d.venceEl)" />
                }
              </div>
            }</td
        ></ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
        <tr mat-row *matRowDef="let u; columns: columnas()"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="unidades" vacio="No hay unidades registradas." [error]="error()" [cargando]="cargando()" />
  `,
})
export class UnidadesPagina {
  private readonly fachada = inject(UnidadesFachada);
  readonly sesion = inject(Sesion);
  readonly unidades = this.fachada.unidades;
  readonly error = this.fachada.error;
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly campos = { unidades: 'Flota' };
  readonly columnas = columnasConEstado(['placa', 'tipo', 'estado', 'km', 'documentos']);
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
      urgencia: (u) => urgenciaUnidad(u),
      // El documento que vence primero.
      documentos: (u) => u.documentos.map((d) => d.venceEl).sort()[0],
    },
    // Lo que no puede salir primero (JV-1); los encabezados siguen ordenando por su columna.
    ordenInicial: { orden: 'urgencia', dir: 'asc' },
  });
}
