import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { BobPipe, completo, FechaPipe } from 'ui-comun';
import { CombustibleGQL, type CombustibleQuery } from '../graphql/generado';

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

/** Anomalías de Isolation Forest (FF2) y las últimas cargas. Una alerta abre aquí con la carga marcada. */
@Component({
  selector: 'app-combustible',
  imports: [MatTableModule, DecimalPipe, BobPipe, FechaPipe],
  template: `
    <h1>Combustible</h1>
    <h2>Anomalías de los últimos 30 días</h2>
    <div class="tabla-ancha">
      <table mat-table [dataSource]="anomalias()">
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef>Placa</th>
          <td mat-cell *matCellDef="let a">{{ a.placa }}</td></ng-container
        >
        <ng-container matColumnDef="litros"
          ><th mat-header-cell *matHeaderCellDef>Litros</th>
          <td mat-cell *matCellDef="let a">{{ a.litros | number: '1.0-1' }}</td></ng-container
        >
        <ng-container matColumnDef="kmPorLitro"
          ><th mat-header-cell *matHeaderCellDef>Km/L</th>
          <td mat-cell *matCellDef="let a">{{ a.kmPorLitro | number: '1.2-2' }}</td></ng-container
        >
        <ng-container matColumnDef="puntaje"
          ><th mat-header-cell *matHeaderCellDef>Puntaje</th>
          <td mat-cell *matCellDef="let a">{{ a.puntaje | number: '1.2-2' }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef>Registrada</th>
          <td mat-cell *matCellDef="let a">{{ a.registradaEn | fecha: true }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnasA"></tr>
        <tr mat-row *matRowDef="let a; columns: columnasA" [class.marcada]="a.cargaId === id()"></tr>
      </table>
    </div>
    <h2>Últimas cargas</h2>
    <div class="tabla-ancha">
      <table mat-table [dataSource]="cargas()">
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef>Placa</th>
          <td mat-cell *matCellDef="let c">{{ c.placa }}</td></ng-container
        >
        <ng-container matColumnDef="litros"
          ><th mat-header-cell *matHeaderCellDef>Litros</th>
          <td mat-cell *matCellDef="let c">{{ c.litros | number: '1.0-1' }}</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef>Monto</th>
          <td mat-cell *matCellDef="let c">{{ c.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="km"
          ><th mat-header-cell *matHeaderCellDef>Odómetro</th>
          <td mat-cell *matCellDef="let c">{{ c.kilometraje | number }}</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef>Registrada</th>
          <td mat-cell *matCellDef="let c">{{ c.registradaEn | fecha: true }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnasC"></tr>
        <tr mat-row *matRowDef="let c; columns: columnasC" [class.marcada]="c.cargaId === id()"></tr>
      </table>
    </div>
  `,
  styles: `
    .marcada {
      background: var(--mat-sys-error-container);
    }
  `,
})
export class CombustiblePagina {
  readonly id = input<string>();
  private readonly datos = toSignal(inject(CombustibleGQL).watch({ variables: { desde: hace(30) }, pollInterval: 30_000 }).valueChanges);
  readonly anomalias = computed(() => completo<CombustibleQuery>(this.datos())?.anomaliasCombustible ?? []);
  readonly cargas = computed(() => completo<CombustibleQuery>(this.datos())?.cargasCombustible ?? []);
  readonly columnasA = ['placa', 'litros', 'kmPorLitro', 'puntaje', 'fecha'];
  readonly columnasC = ['placa', 'litros', 'monto', 'km', 'fecha'];
}
