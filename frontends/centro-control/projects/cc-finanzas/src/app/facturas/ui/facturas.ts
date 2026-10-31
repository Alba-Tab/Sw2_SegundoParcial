import { Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AvisoServicios, BobPipe, FechaPipe } from 'ui-comun';
import { FacturasFachada } from '../facturas.fachada';

@Component({
  selector: 'app-facturas',
  providers: [FacturasFachada],
  imports: [MatTableModule, MatButtonToggleModule, RouterLink, BobPipe, FechaPipe, AvisoServicios],
  template: `
    <div class="fila-acciones">
      <h1>Facturas</h1>
      <mat-button-toggle-group [value]="conSaldo()" (change)="conSaldo.set($event.value)">
        <mat-button-toggle [value]="true">Con saldo</mat-button-toggle>
        <mat-button-toggle [value]="null">Todas</mat-button-toggle>
      </mat-button-toggle-group>
    </div>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!facturas().length" />
    <div class="tabla-ancha">
      <table mat-table [dataSource]="facturas()">
        <ng-container matColumnDef="numero"
          ><th mat-header-cell *matHeaderCellDef>Factura</th>
          <td mat-cell *matCellDef="let f">
            <a [routerLink]="['/facturas', f.facturaId]">{{ f.numero }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef>Cliente</th>
          <td mat-cell *matCellDef="let f">{{ f.razonSocial }}</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef>Monto</th>
          <td mat-cell *matCellDef="let f">{{ f.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="saldo"
          ><th mat-header-cell *matHeaderCellDef>Saldo</th>
          <td mat-cell *matCellDef="let f">{{ f.saldo | bob }}</td></ng-container
        >
        <ng-container matColumnDef="vence"
          ><th mat-header-cell *matHeaderCellDef>Vence</th>
          <td mat-cell *matCellDef="let f" [class.no-disponible]="f.vencida">
            {{ f.venceEl | fecha }}{{ f.vencida ? ' (' + f.diasVencida + ' días)' : '' }}
          </td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let f">
            <span class="chip-estado">{{ f.estado }}</span>
          </td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let f; columns: columnas"></tr>
      </table>
    </div>
  `,
})
export class FacturasPagina {
  private readonly fachada = inject(FacturasFachada);
  readonly conSaldo = this.fachada.conSaldo;
  readonly facturas = this.fachada.facturas;
  readonly error = this.fachada.error;
  readonly campos = { facturas: 'Finanzas' };
  readonly columnas = ['numero', 'cliente', 'monto', 'saldo', 'vence', 'estado'];
}
