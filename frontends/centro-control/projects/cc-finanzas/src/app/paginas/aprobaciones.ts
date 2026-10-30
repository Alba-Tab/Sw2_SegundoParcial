import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AvisoServicios, BobPipe, completo, FechaPipe, mensajeDe, nuevaClave, Sesion } from 'ui-comun';
import { AprobarCreditoGQL, SolicitudesGQL, type SolicitudesQuery } from '../graphql/generado';

/** Spec 012 (paso 2b de la saga): cliente en mora; administración aprueba o rechaza antes de que venza la espera. */
@Component({
  selector: 'app-aprobaciones',
  imports: [FormsModule, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, BobPipe, FechaPipe, AvisoServicios],
  template: `
    <h1>Aprobación de crédito</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!solicitudes().length" />
    <div class="tarjetas">
      @for (s of solicitudes(); track s.servicioId) {
        <mat-card>
          <mat-card-header>
            <mat-card-title>{{ s.razonSocial }} · {{ s.monto | bob }}</mat-card-title>
            <mat-card-subtitle
              ><span class="chip-estado" [attr.data-alerta]="s.estado === 'PENDIENTE'">{{ s.estado }}</span> · vence
              {{ s.venceEn | fecha: true }}</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <p>Motivos: {{ s.motivos.join(', ') }}</p>
            @for (f of s.facturasVencidas ?? []; track f.facturaId) {
              <p class="secundario">{{ f.numero }} · {{ f.saldo | bob }} · vencida hace {{ f.diasVencida }} días</p>
            }
            @if (s.estado === 'PENDIENTE' && sesion.tiene('administracion')) {
              <mat-form-field class="ancho"
                ><mat-label>Motivo (obligatorio para rechazar)</mat-label><input matInput [(ngModel)]="motivos[s.servicioId]"
              /></mat-form-field>
              <div class="fila-acciones">
                <button mat-flat-button (click)="decidir(s.servicioId, true)" [disabled]="enviando()">Aprobar</button>
                <button
                  mat-stroked-button
                  (click)="decidir(s.servicioId, false)"
                  [disabled]="enviando() || (motivos[s.servicioId] ?? '').trim().length < 3"
                >
                  Rechazar
                </button>
              </div>
            } @else if (s.decididaPor) {
              <p class="secundario">Decidida por {{ s.decididaPor }} {{ s.motivoDecision ?? '' }}</p>
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="secundario">No hay solicitudes.</p>
      }
    </div>
  `,
  styles: `
    .ancho {
      width: 100%;
    }
  `,
})
export class AprobacionesPagina {
  private readonly gql = inject(SolicitudesGQL);
  private readonly decidirGql = inject(AprobarCreditoGQL);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  private readonly datos = toSignal(this.gql.watch({ pollInterval: 15_000 }).valueChanges);
  readonly solicitudes = computed(() => completo<SolicitudesQuery>(this.datos())?.solicitudesAprobacion ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { solicitudesAprobacion: 'Finanzas' };
  readonly enviando = signal(false);
  motivos: Record<string, string> = {};

  async decidir(servicioId: string, aprobado: boolean): Promise<void> {
    this.enviando.set(true);
    try {
      const motivo = this.motivos[servicioId]?.trim() || undefined;
      await firstValueFrom(this.decidirGql.mutate({ variables: { servicioId, aprobado, motivo, clave: nuevaClave() } }));
      this.avisos.open(aprobado ? 'Crédito aprobado: la saga sigue' : 'Crédito rechazado', undefined, { duration: 5000 });
      await firstValueFrom(this.gql.fetch());
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
