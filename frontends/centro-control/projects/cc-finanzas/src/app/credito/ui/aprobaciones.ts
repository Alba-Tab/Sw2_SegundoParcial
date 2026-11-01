import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  BobPipe,
  controlLista,
  Encabezado,
  Estado,
  EtiquetaPipe,
  FechaPipe,
  FiltrosLista,
  mensajeDe,
  PieLista,
  Sesion,
} from 'ui-comun';
import { CreditoFachada } from '../credito.fachada';
import { puedeRechazar } from '../domain/credito';

/** Spec 012 (paso 2b de la saga): cliente en mora; administración aprueba o rechaza antes de que venza la espera. */
@Component({
  selector: 'app-aprobaciones',
  providers: [CreditoFachada],
  imports: [
    Encabezado,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    BobPipe,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado titulo="Aprobación de crédito" />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!solicitudes().length" />
    <cc-filtros-lista [control]="lista" busqueda="Buscar por cliente" grupo="EstadoAprobacion" nombre="solicitudes" singular="solicitud" />
    <div class="tarjetas">
      @for (s of lista.visibles(); track s.servicioId) {
        <mat-card>
          <mat-card-header>
            <mat-card-title>{{ s.razonSocial }} · {{ s.monto | bob }}</mat-card-title>
            <mat-card-subtitle
              ><cc-estado grupo="EstadoAprobacion" [valor]="s.estado" /> · vence {{ s.venceEn | fecha: true }}</mat-card-subtitle
            >
          </mat-card-header>
          <mat-card-content>
            <p>
              Motivos:
              @for (m of s.motivos; track m) {
                {{ m | etiqueta: 'MotivoAprobacion' }}{{ $last ? '' : ', ' }}
              }
            </p>
            @for (f of s.facturasVencidas ?? []; track f.facturaId) {
              <p class="secundario">{{ f.numero }} · {{ f.saldo | bob }} · vencida hace {{ f.diasVencida }} días</p>
            }
            @if (s.estado === 'PENDIENTE' && sesion.tiene('administracion')) {
              <mat-form-field class="ancho"
                ><mat-label>Motivo (obligatorio para rechazar)</mat-label><input matInput [(ngModel)]="motivos[s.servicioId]"
              /></mat-form-field>
              <div class="fila-acciones">
                <button mat-flat-button (click)="decidir(s.servicioId, true)" [disabled]="enviando()">
                  <mat-icon>thumb_up</mat-icon>Aprobar
                </button>
                <button
                  mat-stroked-button
                  (click)="decidir(s.servicioId, false)"
                  [disabled]="enviando() || !puedeRechazar(motivos[s.servicioId])"
                >
                  <mat-icon>block</mat-icon>Rechazar
                </button>
              </div>
            } @else if (s.decididaPor) {
              <p class="secundario">Decidida por {{ s.decididaPor }} {{ s.motivoDecision ?? '' }}</p>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
    <cc-pie-lista [control]="lista" nombre="solicitudes" vacio="No hay solicitudes de aprobación." [error]="error()" />
  `,
  styles: `
    .ancho {
      width: 100%;
    }
  `,
})
export class AprobacionesPagina {
  private readonly fachada = inject(CreditoFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly solicitudes = this.fachada.solicitudes;
  readonly error = this.fachada.error;
  readonly campos = { solicitudesAprobacion: 'Finanzas' };
  readonly lista = controlLista({
    filas: this.solicitudes,
    texto: (s) => s.razonSocial ?? '',
    estado: (s) => s.estado,
  });
  readonly enviando = signal(false);
  readonly puedeRechazar = puedeRechazar;
  motivos: Record<string, string> = {};

  async decidir(servicioId: string, aprobado: boolean): Promise<void> {
    this.enviando.set(true);
    try {
      const motivo = this.motivos[servicioId]?.trim() || undefined;
      await this.fachada.decidir(servicioId, aprobado, motivo);
      this.avisos.open(aprobado ? 'Crédito aprobado: la saga sigue' : 'Crédito rechazado', undefined, { duration: 5000 });
      await this.fachada.recargar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
