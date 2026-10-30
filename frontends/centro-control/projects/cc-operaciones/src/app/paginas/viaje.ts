import { Component, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { type Observable, firstValueFrom, switchMap } from 'rxjs';
import { AvisoServicios, BobPipe, FechaPipe, mensajeDe, nuevaClave, pct, Sesion } from 'ui-comun';
import { AprobarEntregaGQL, RechazarEntregaGQL, ResolverIntervencionGQL, ViajeGQL, type OpcionIntervencion } from '../graphql/generado';

/** Detalle del viaje (al que llevan las alertas): bitácora, entrega, riesgo y las decisiones del despachador. */
@Component({
  selector: 'app-viaje',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    BobPipe,
    FechaPipe,
    AvisoServicios,
  ],
  template: `
    @let r = datos();
    @if (r?.loading && !r?.data) {
      <mat-progress-bar mode="indeterminate" />
    }
    <cc-aviso-servicios [error]="r?.error" [campos]="campos" [sinDatos]="!r?.data?.viaje" />
    @if (r?.data?.viaje; as v) {
      <h1>
        Viaje {{ v.placa }} · <span class="chip-estado" [attr.data-alerta]="alerta(v.estado)">{{ v.estado }}</span>
      </h1>
      <div class="tarjetas">
        <mat-card>
          <mat-card-content>
            <p><b>Cliente:</b> {{ v.cliente?.razonSocial }}</p>
            <p><b>Ruta:</b> {{ v.ruta?.nombre }} ({{ v.ruta?.distanciaKm }} km)</p>
            <p><b>Carga:</b> {{ v.tipoCarga }} · {{ v.toneladas }} t · {{ v.fechaViaje | fecha }}</p>
            <p><b>Chofer:</b> {{ v.choferNombre }} · <b>Unidad:</b> {{ v.unidad?.placa ?? v.placa }} ({{ v.unidad?.estado ?? '—' }})</p>
            @if (sesion.tiene('gerente', 'comercial', 'administracion')) {
              <p><b>Monto:</b> {{ v.monto | bob }}</p>
            }
            <p class="secundario">Iniciado {{ v.iniciadoEn | fecha: true }} · última posición {{ v.ultimaPosicionEn | fecha: true }}</p>
          </mat-card-content>
        </mat-card>
        @if (v.riesgo; as riesgo) {
          <mat-card>
            <mat-card-header
              ><mat-card-title>Riesgo de retraso {{ pct(riesgo.probabilidad) }}</mat-card-title></mat-card-header
            >
            <mat-card-content>
              @for (f of riesgo.factores; track f.nombre) {
                <p>{{ f.nombre }} (+{{ pct(f.aporte) }})</p>
              }
              <p class="secundario">Calculado {{ riesgo.calculadaEn | fecha: true }} · umbral {{ pct(riesgo.umbral) }}</p>
            </mat-card-content>
          </mat-card>
        }
        @if (v.entrega; as e) {
          <mat-card>
            <mat-card-header
              ><mat-card-title>{{ e.tipo === 'RECHAZO' ? 'Rechazo' : 'Entrega' }}</mat-card-title></mat-card-header
            >
            <mat-card-content>
              <p>
                {{ e.registradaEn | fecha: true }} · {{ e.dentroGeocerca ? 'dentro' : 'fuera' }} de la geocerca ({{ e.distanciaMetros }} m)
              </p>
              <p>{{ e.conFirma ? 'Con firma de ' + e.nombreReceptor : 'Sin firma' }}</p>
              @if (e.razones?.length) {
                <p>Razones: {{ e.razones?.join(', ') }}</p>
              }
              @if (e.motivo) {
                <p>Motivo: {{ e.motivo }}</p>
              }
            </mat-card-content>
          </mat-card>
        }
      </div>

      @if (sesion.tiene('despachador') && v.estado === 'ENTREGA_OBSERVADA') {
        <h2>Entrega observada</h2>
        <div class="fila-acciones">
          <mat-form-field class="ancho"
            ><mat-label>Nota o motivo (3 a 300)</mat-label><input matInput [(ngModel)]="texto"
          /></mat-form-field>
          <button mat-flat-button (click)="aprobar(id())" [disabled]="enviando()">Aprobar entrega</button>
          <button mat-stroked-button (click)="rechazar(id())" [disabled]="enviando() || texto.trim().length < 3">
            Rechazar (no se factura)
          </button>
        </div>
      }
      @if (sesion.tiene('despachador') && v.estado === 'REQUIERE_INTERVENCION') {
        <h2>Intervención</h2>
        <div class="fila-acciones">
          <mat-form-field class="ancho"
            ><mat-label>Nota (obligatoria para marcar resuelto)</mat-label><input matInput [(ngModel)]="texto"
          /></mat-form-field>
          <button mat-flat-button (click)="resolver(id(), 'REINTENTAR_COMPENSACION')" [disabled]="enviando()">
            Reintentar la compensación
          </button>
          <button mat-stroked-button (click)="resolver(id(), 'MARCAR_RESUELTO')" [disabled]="enviando() || texto.trim().length < 3">
            Marcar resuelto
          </button>
        </div>
      }

      <h2>Bitácora</h2>
      @for (h of v.hitos ?? []; track h.hitoId) {
        <p class="hito">
          <span class="chip-estado">{{ h.tipo }}</span> {{ h.registradoEn | fecha: true }} · {{ h.descripcion }}
          <span class="secundario">({{ h.origen }})</span>
        </p>
      } @empty {
        <p class="secundario">Sin hitos.</p>
      }
    } @else if (r && !r.loading && !r.error) {
      <p class="no-disponible">El viaje no existe</p>
    }
  `,
  styles: `
    .ancho {
      min-width: 320px;
    }
    .hito {
      margin: 6px 0;
    }
  `,
})
export class ViajePagina {
  private readonly gql = inject(ViajeGQL);
  private readonly aprobarGql = inject(AprobarEntregaGQL);
  private readonly rechazarGql = inject(RechazarEntregaGQL);
  private readonly resolverGql = inject(ResolverIntervencionGQL);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  readonly datos = toSignal(
    toObservable(this.id).pipe(switchMap((id) => this.gql.watch({ variables: { id }, pollInterval: 20_000 }).valueChanges)),
  );
  readonly enviando = signal(false);
  readonly pct = pct;
  readonly campos = { viaje: 'Viajes', unidad: 'Flota', riesgo: 'Analítica' };
  readonly alerta = (estado?: string) => ['ENTREGA_OBSERVADA', 'REQUIERE_INTERVENCION', 'ENTREGA_RECHAZADA'].includes(estado ?? '');
  texto = '';

  aprobar(viajeId: string) {
    return this.enviar(
      this.aprobarGql.mutate({ variables: { viajeId, nota: this.texto.trim() || undefined, clave: nuevaClave() } }),
      'Entrega aprobada: se factura',
    );
  }
  rechazar(viajeId: string) {
    return this.enviar(
      this.rechazarGql.mutate({ variables: { viajeId, motivo: this.texto.trim(), clave: nuevaClave() } }),
      'Entrega rechazada',
    );
  }
  resolver(viajeId: string, opcion: OpcionIntervencion) {
    return this.enviar(
      this.resolverGql.mutate({ variables: { viajeId, opcion, nota: this.texto.trim() || undefined, clave: nuevaClave() } }),
      'Intervención enviada',
    );
  }

  private async enviar(peticion: Observable<unknown>, ok: string): Promise<void> {
    this.enviando.set(true);
    try {
      await firstValueFrom(peticion);
      this.texto = '';
      this.avisos.open(ok, undefined, { duration: 4000 });
      await firstValueFrom(this.gql.fetch({ variables: { id: this.id() } }));
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
