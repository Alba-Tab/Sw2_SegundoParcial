import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { FechaPipe } from 'ui-comun';
import { EntregasObservadasGQL } from '../graphql/generado';

/** Spec 007: entregas fuera de la geocerca o sin firma, para aprobar o rechazar en el detalle del viaje. */
@Component({
  selector: 'app-entregas',
  imports: [MatCardModule, RouterLink, FechaPipe],
  template: `
    <h1>Entregas observadas</h1>
    <div class="tarjetas">
      @for (v of datos()?.data?.entregasObservadas ?? []; track v.viajeId) {
        <mat-card>
          <mat-card-header
            ><mat-card-title>{{ v.placa }} · {{ v.cliente?.razonSocial }}</mat-card-title></mat-card-header
          >
          <mat-card-content>
            <p>{{ v.ruta?.nombre }} · {{ v.entrega?.registradaEn | fecha: true }}</p>
            <p>A {{ v.entrega?.distanciaMetros }} m del destino · {{ v.entrega?.conFirma ? 'con firma' : 'sin firma' }}</p>
            <p class="secundario">{{ v.entrega?.razones?.join(', ') }}</p>
            <a [routerLink]="['/viajes', v.viajeId]">Revisar y decidir →</a>
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="secundario">No hay entregas observadas.</p>
      }
    </div>
  `,
})
export class EntregasPagina {
  readonly datos = toSignal(inject(EntregasObservadasGQL).watch({ pollInterval: 15_000 }).valueChanges);
}
