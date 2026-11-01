import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { AvisoServicios, controlLista, Encabezado, FechaPipe, FiltrosLista, PieLista } from 'ui-comun';
import { ConduccionFachada } from '../conduccion.fachada';
import { PUNTAJE_BAJO, type PuntajeChofer } from '../domain/conduccion';

/** D84: max(0, 100 − 10 × (frenadas + 2 × fatigas) × 100 / km), por chofer en la semana. */
@Component({
  selector: 'app-conduccion',
  providers: [ConduccionFachada],
  imports: [Encabezado, MatTableModule, MatSortModule, DecimalPipe, FechaPipe, AvisoServicios, FiltrosLista, PieLista],
  template: `
    <cc-encabezado titulo="Puntaje de conducción" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!puntajes()" />
    @if (puntajes(); as p) {
      <p class="secundario">Semana del {{ p.desde | fecha }} al {{ p.hasta | fecha }} · datos al {{ p.datosAl | fecha: true }}</p>
      <cc-filtros-lista [control]="lista" busqueda="Buscar por chofer" nombre="choferes" singular="chofer" />
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
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Chofer</th>
            <td mat-cell *matCellDef="let c">{{ c.nombre ?? c.choferId }}</td></ng-container
          >
          <ng-container matColumnDef="frenadas"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Frenadas</th>
            <td mat-cell *matCellDef="let c">{{ c.frenadas }}</td></ng-container
          >
          <ng-container matColumnDef="fatigas"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Fatigas</th>
            <td mat-cell *matCellDef="let c">{{ c.fatigas }}</td></ng-container
          >
          <ng-container matColumnDef="km"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Km</th>
            <td mat-cell *matCellDef="let c">{{ c.km | number: '1.0-0' }}</td></ng-container
          >
          <ng-container matColumnDef="puntaje"
            ><th mat-header-cell *matHeaderCellDef mat-sort-header>Puntaje</th>
            <td mat-cell *matCellDef="let c" [class.no-disponible]="c.puntaje < puntajeBajo">
              {{ c.puntaje | number: '1.0-1' }}
            </td></ng-container
          >
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let c; columns: columnas"></tr>
        </table>
      </div>
      <cc-pie-lista [control]="lista" nombre="choferes" vacio="Sin frenadas ni alertas de fatiga esta semana." [error]="error()" />
    }
  `,
})
export class ConduccionPagina {
  private readonly fachada = inject(ConduccionFachada);
  readonly puntajes = this.fachada.puntajes;
  readonly error = this.fachada.error;
  readonly puntajeBajo = PUNTAJE_BAJO;
  readonly campos = { puntajesConduccion: 'Analítica' };
  readonly columnas = ['nombre', 'frenadas', 'fatigas', 'km', 'puntaje'];
  readonly lista = controlLista<PuntajeChofer>({
    filas: computed(() => this.puntajes()?.choferes ?? []),
    texto: (c) => c.nombre ?? c.choferId,
    orden: {
      nombre: (c) => c.nombre ?? c.choferId,
      frenadas: (c) => c.frenadas,
      fatigas: (c) => c.fatigas,
      km: (c) => c.km,
      puntaje: (c) => c.puntaje,
    },
    // Los puntajes más bajos primero: son los que piden una conversación con el chofer.
    ordenInicial: { orden: 'puntaje', dir: 'asc' },
  });
}
