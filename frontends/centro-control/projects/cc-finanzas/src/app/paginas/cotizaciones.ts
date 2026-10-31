import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { AvisoServicios, BobPipe, completo, FechaPipe } from 'ui-comun';
import { CotizacionesGQL, type CotizacionesQuery } from '../graphql/generado';

@Component({
  selector: 'app-cotizaciones',
  imports: [MatTableModule, BobPipe, FechaPipe, AvisoServicios],
  template: `
    <h1>Cotizaciones</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!cotizaciones().length" />
    <div class="tabla-ancha">
      <table mat-table [dataSource]="cotizaciones()">
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef>Cliente</th>
          <td mat-cell *matCellDef="let c">{{ nombre(c.clienteId) }}</td></ng-container
        >
        <ng-container matColumnDef="ruta"
          ><th mat-header-cell *matHeaderCellDef>Ruta</th>
          <td mat-cell *matCellDef="let c">{{ ruta(c.rutaId) }}</td></ng-container
        >
        <ng-container matColumnDef="carga"
          ><th mat-header-cell *matHeaderCellDef>Carga</th>
          <td mat-cell *matCellDef="let c">{{ c.tipoCarga }} · {{ c.toneladas }} t</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef>Monto</th>
          <td mat-cell *matCellDef="let c">{{ c.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="estado"
          ><th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let c">
            <span class="chip-estado">{{ c.vencida ? 'VENCIDA' : c.estado }}</span>
          </td></ng-container
        >
        <ng-container matColumnDef="creada"
          ><th mat-header-cell *matHeaderCellDef>Creada</th>
          <td mat-cell *matCellDef="let c">{{ c.creadaEn | fecha: true }} · {{ c.canal }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let c; columns: columnas"></tr>
      </table>
    </div>
  `,
})
export class CotizacionesPagina {
  private readonly datos = toSignal(inject(CotizacionesGQL).watch({ pollInterval: 30_000 }).valueChanges);
  private readonly d = computed(() => completo<CotizacionesQuery>(this.datos()));
  readonly cotizaciones = computed(() => this.d()?.cotizaciones ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { cotizaciones: 'Finanzas', clientes: 'Viajes', rutas: 'Viajes' };
  readonly columnas = ['cliente', 'ruta', 'carga', 'monto', 'estado', 'creada'];
  nombre = (id: string) => this.d()?.clientes?.find((c) => c.clienteId === id)?.razonSocial ?? id;
  ruta = (id: string) => this.d()?.rutas?.find((r) => r.rutaId === id)?.nombre ?? id;
}
