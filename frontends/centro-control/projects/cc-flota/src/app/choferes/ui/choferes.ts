import { Component, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AvisoServicios, controlLista, Encabezado, Estado, etiqueta, FechaPipe, FiltrosLista, PieLista } from 'ui-comun';
import { ChoferesFachada } from '../choferes.fachada';
import { estadoChofer, textoChofer, vigenciaLicencia, type Chofer } from '../domain/chofer';

/** G3: lista de choferes con su licencia y estado. Solo lectura hasta que el backend tenga alta y edición. */
@Component({
  selector: 'app-choferes',
  providers: [ChoferesFachada],
  imports: [Encabezado, MatTableModule, MatSortModule, RouterLink, FechaPipe, Estado, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado titulo="Choferes" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!choferes().length" />
    <cc-filtros-lista [control]="lista" busqueda="Buscar por nombre o licencia" grupo="EstadoChofer" nombre="choferes" singular="chofer" />
    <div class="tabla-ancha">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="nombre"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Nombre</th>
          <td mat-cell *matCellDef="let c">
            <a [routerLink]="['/choferes', c.choferId]">{{ c.nombre }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="licencia"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Licencia</th>
          <td mat-cell *matCellDef="let c">Categoría {{ c.licenciaCategoria }}</td></ng-container
        >
        <ng-container matColumnDef="vence"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Licencia vence</th>
          <td mat-cell *matCellDef="let c">
            {{ c.licenciaVenceEl | fecha }}
            @if (vigencia(c) !== 'VIGENTE') {
              <cc-estado grupo="Vigencia" [valor]="vigencia(c)" />
            }</td
        ></ng-container>
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let c"><cc-estado grupo="EstadoChofer" [valor]="estado(c)" /></td
        ></ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let c; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="choferes" vacio="No hay choferes registrados." [error]="error()" />
  `,
})
export class ChoferesPagina {
  private readonly fachada = inject(ChoferesFachada);
  readonly choferes = this.fachada.choferes;
  readonly error = this.fachada.error;
  readonly campos = { choferes: 'Flota' };
  readonly columnas = ['nombre', 'licencia', 'vence', 'estado'];
  readonly estado = estadoChofer;
  readonly vigencia = (c: Chofer) => vigenciaLicencia(c);
  readonly lista = controlLista<Chofer>({
    filas: this.choferes,
    texto: textoChofer,
    estado: estadoChofer,
    orden: {
      nombre: (c) => c.nombre,
      licencia: (c) => c.licenciaCategoria,
      vence: (c) => c.licenciaVenceEl,
      estado: (c) => etiqueta('EstadoChofer', estadoChofer(c)).texto,
    },
    ordenInicial: { orden: 'nombre', dir: 'asc' },
  });
}
