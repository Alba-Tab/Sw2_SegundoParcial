import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { AvisoServicios, completo, FechaPipe } from 'ui-comun';
import { ConduccionGQL, type ConduccionQuery } from '../graphql/generado';

/** D84: max(0, 100 − 10 × (frenadas + 2 × fatigas) × 100 / km), por chofer en la semana. */
@Component({
  selector: 'app-conduccion',
  imports: [MatTableModule, DecimalPipe, FechaPipe, AvisoServicios],
  template: `
    <h1>Puntaje de conducción</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!puntajes()" />
    @if (puntajes(); as p) {
      <p class="secundario">Semana del {{ p.desde | fecha }} al {{ p.hasta | fecha }} · datos al {{ p.datosAl | fecha: true }}</p>
      <div class="tabla-ancha">
        <table mat-table [dataSource]="p.choferes">
          <ng-container matColumnDef="nombre"
            ><th mat-header-cell *matHeaderCellDef>Chofer</th>
            <td mat-cell *matCellDef="let c">{{ c.nombre ?? c.choferId }}</td></ng-container
          >
          <ng-container matColumnDef="frenadas"
            ><th mat-header-cell *matHeaderCellDef>Frenadas</th>
            <td mat-cell *matCellDef="let c">{{ c.frenadas }}</td></ng-container
          >
          <ng-container matColumnDef="fatigas"
            ><th mat-header-cell *matHeaderCellDef>Fatigas</th>
            <td mat-cell *matCellDef="let c">{{ c.fatigas }}</td></ng-container
          >
          <ng-container matColumnDef="km"
            ><th mat-header-cell *matHeaderCellDef>Km</th>
            <td mat-cell *matCellDef="let c">{{ c.km | number: '1.0-0' }}</td></ng-container
          >
          <ng-container matColumnDef="puntaje"
            ><th mat-header-cell *matHeaderCellDef>Puntaje</th>
            <td mat-cell *matCellDef="let c" [class.no-disponible]="c.puntaje < 70">{{ c.puntaje | number: '1.0-1' }}</td></ng-container
          >
          <tr mat-header-row *matHeaderRowDef="columnas"></tr>
          <tr mat-row *matRowDef="let c; columns: columnas"></tr>
        </table>
      </div>
      @if (!p.choferes.length) {
        <p class="secundario">Sin frenadas ni alertas de fatiga esta semana.</p>
      }
    }
  `,
})
export class ConduccionPagina {
  private readonly datos = toSignal(inject(ConduccionGQL).watch({ pollInterval: 60_000 }).valueChanges);
  readonly puntajes = computed(() => completo<ConduccionQuery>(this.datos())?.puntajesConduccion);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { puntajesConduccion: 'Analítica' };
  readonly columnas = ['nombre', 'frenadas', 'fatigas', 'km', 'puntaje'];
}
