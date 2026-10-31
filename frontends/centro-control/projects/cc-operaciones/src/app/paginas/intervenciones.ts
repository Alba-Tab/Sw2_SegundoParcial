import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { AvisoServicios, FechaPipe } from 'ui-comun';
import { IntervencionesGQL } from '../graphql/generado';

/** Spec 011: viajes cuya compensación se agotó; el despachador reintenta o marca resuelto en el detalle. */
@Component({
  selector: 'app-intervenciones',
  imports: [MatCardModule, RouterLink, FechaPipe, AvisoServicios],
  template: `
    <h1>Intervenciones</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!datos()?.data?.intervenciones?.length" />
    <div class="tarjetas">
      @for (v of datos()?.data?.intervenciones ?? []; track v.viajeId) {
        <mat-card>
          <mat-card-header
            ><mat-card-title>{{ v.placa ?? 'Sin unidad' }} · {{ v.cliente?.razonSocial }}</mat-card-title></mat-card-header
          >
          <mat-card-content>
            <p>{{ v.ruta?.nombre }} · {{ v.fechaViaje | fecha }}</p>
            <p class="secundario">{{ v.motivo }}</p>
            <a [routerLink]="['/viajes', v.viajeId]">Resolver →</a>
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="secundario">No hay viajes que requieran intervención.</p>
      }
    </div>
  `,
})
export class IntervencionesPagina {
  readonly datos = toSignal(inject(IntervencionesGQL).watch({ pollInterval: 15_000 }).valueChanges);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { intervenciones: 'Viajes' };
}
