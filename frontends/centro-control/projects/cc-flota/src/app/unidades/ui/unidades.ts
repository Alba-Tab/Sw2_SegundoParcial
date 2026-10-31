import { Component, inject } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AvisoServicios, FechaPipe } from 'ui-comun';
import { AVISO_KM } from '../domain/unidad';
import { UnidadesFachada } from '../unidades.fachada';

@Component({
  selector: 'app-unidades',
  providers: [UnidadesFachada],
  imports: [MatTableModule, RouterLink, FechaPipe, DecimalPipe, AvisoServicios],
  template: `
    <h1>Unidades</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!unidades().length" />
    <div class="tabla-ancha">
      <table mat-table [dataSource]="unidades()">
        <ng-container matColumnDef="placa"
          ><th mat-header-cell *matHeaderCellDef>Placa</th>
          <td mat-cell *matCellDef="let u">
            <a [routerLink]="['/unidades', u.unidadId]">{{ u.placa }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="tipo"
          ><th mat-header-cell *matHeaderCellDef>Tipo</th>
          <td mat-cell *matCellDef="let u">{{ u.tipoUnidad }} {{ u.tipoRemolque ?? '' }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let u">
            <span class="chip-estado" [attr.data-alerta]="u.estado === 'MANTENIMIENTO_PENDIENTE'">{{ u.estado }}</span>
          </td></ng-container
        >
        <ng-container matColumnDef="km"
          ><th mat-header-cell *matHeaderCellDef>Km desde el mantenimiento</th>
          <td mat-cell *matCellDef="let u" [class.no-disponible]="u.kmDesdeUltimoMantenimiento >= avisoKm">
            {{ u.kmDesdeUltimoMantenimiento | number }}
          </td></ng-container
        >
        <ng-container matColumnDef="documentos"
          ><th mat-header-cell *matHeaderCellDef>Documentos</th>
          <td mat-cell *matCellDef="let u">
            @for (d of u.documentos; track d.tipo) {
              <span class="secundario">{{ d.tipo }} {{ d.venceEl | fecha }} </span>
            }
          </td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let u; columns: columnas"></tr>
      </table>
    </div>
  `,
})
export class UnidadesPagina {
  private readonly fachada = inject(UnidadesFachada);
  readonly unidades = this.fachada.unidades;
  readonly error = this.fachada.error;
  readonly campos = { unidades: 'Flota' };
  readonly columnas = ['placa', 'tipo', 'estado', 'km', 'documentos'];
  readonly avisoKm = AVISO_KM;
}
