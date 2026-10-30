import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { FechaPipe, mensajeDe } from 'ui-comun';
import { ViajesGQL, type EstadoViaje } from '../graphql/generado';

const ESTADOS: EstadoViaje[] = [
  'CONFIRMADO',
  'EN_RUTA',
  'ENTREGA_OBSERVADA',
  'ENTREGADO',
  'CERRADO',
  'ENTREGA_RECHAZADA',
  'REQUIERE_INTERVENCION',
  'CANCELADO',
];

@Component({
  selector: 'app-viajes',
  imports: [MatTableModule, MatSelectModule, MatProgressBarModule, RouterLink, FechaPipe],
  template: `
    <div class="fila-acciones">
      <h1>Viajes</h1>
      <mat-select class="filtro" [value]="estado()" (valueChange)="estado.set($event)" aria-label="Estado">
        <mat-option [value]="null">Todos</mat-option>
        @for (e of estados; track e) {
          <mat-option [value]="e">{{ e }}</mat-option>
        }
      </mat-select>
    </div>
    @let r = datos();
    @if (r?.loading) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (r?.error && !r?.data?.viajes) {
      <p class="no-disponible">{{ mensaje(r?.error) }}</p>
    }
    <div class="tabla-ancha">
      <table mat-table [dataSource]="r?.data?.viajes ?? []">
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef>Placa</th>
          <td mat-cell *matCellDef="let v">
            <a [routerLink]="['/viajes', v.viajeId]">{{ v.placa }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef>Cliente</th>
          <td mat-cell *matCellDef="let v">{{ v.cliente?.razonSocial }}</td></ng-container
        >
        <ng-container matColumnDef="ruta"
          ><th mat-header-cell *matHeaderCellDef>Ruta</th>
          <td mat-cell *matCellDef="let v">{{ v.ruta?.nombre }}</td></ng-container
        >
        <ng-container matColumnDef="chofer"
          ><th mat-header-cell *matHeaderCellDef>Chofer</th>
          <td mat-cell *matCellDef="let v">{{ v.choferNombre }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef>Fecha</th>
          <td mat-cell *matCellDef="let v">{{ v.fechaViaje | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let v">
            <span class="chip-estado">{{ v.estado }}</span>
          </td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let v; columns: columnas"></tr>
      </table>
    </div>
  `,
  styles: `
    .filtro {
      width: 240px;
    }
  `,
})
export class ViajesPagina {
  private readonly gql = inject(ViajesGQL);
  readonly estados = ESTADOS;
  readonly columnas = ['placa', 'cliente', 'ruta', 'chofer', 'fecha', 'estado'];
  readonly estado = signal<EstadoViaje | null>(null);
  readonly datos = toSignal(
    toObservable(this.estado).pipe(switchMap((estado) => this.gql.watch({ variables: { estado }, pollInterval: 15_000 }).valueChanges)),
  );
  readonly mensaje = mensajeDe;
}
