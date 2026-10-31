import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AvisoServicios, CONFIG_CENTRO, FechaPipe, mensajeDe, Sesion } from 'ui-comun';
import { AccionesFachada } from '../acciones.fachada';
import { conLaElegidaPrimero } from '../domain/accion';

/**
 * CU-18 (spec 014): el agente propone; el despachador revisa la evidencia, edita el mensaje y aprueba (sale el correo
 * por n8n) o rechaza. El gerente solo mira (propuesta 7.2).
 */
@Component({
  selector: 'app-acciones',
  providers: [AccionesFachada],
  imports: [FormsModule, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink, FechaPipe, AvisoServicios],
  template: `
    <h1>Acciones propuestas por el agente</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!visibles().length" />
    <div class="lista">
      @for (a of visibles(); track a.accionId) {
        <mat-card [class.elegida]="a.accionId === id()">
          <mat-card-header>
            <mat-card-title>Avisar retraso a {{ a.razonSocial }}</mat-card-title>
            <mat-card-subtitle>
              <span class="chip-estado" [attr.data-alerta]="a.estado === 'PENDIENTE'">{{ a.estado }}</span>
              · {{ a.creadaEn | fecha: true }} · viaje <a [routerLink]="['/viajes', a.viajeId]">{{ a.viaje?.placa ?? a.viajeId }}</a>
              {{ a.viaje?.ruta.destino ? '→ ' + a.viaje.ruta.destino : '' }}
              @if (a.misionId) {
                · <a [href]="config.urls['cc-tablero'] + '/agente?mision=' + a.misionId">ver la misión del agente</a>
              }
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <h3>Evidencia</h3>
            @for (e of a.evidencia; track $index) {
              <p class="evidencia">
                <b>{{ e.fuente }}</b> ({{ e.referencia }}): {{ e.resumen }}
              </p>
            }
            @if (a.estado === 'PENDIENTE' && sesion.tiene('despachador')) {
              <mat-form-field class="mensaje">
                <mat-label>Mensaje al cliente (10 a 1.000)</mat-label>
                <textarea
                  matInput
                  rows="3"
                  minlength="10"
                  maxlength="1000"
                  [(ngModel)]="mensajes[a.accionId]"
                  [ngModelOptions]="{ standalone: true }"
                ></textarea>
              </mat-form-field>
              <div class="fila-acciones">
                <button
                  mat-flat-button
                  (click)="aprobar(a.accionId)"
                  [disabled]="enviando() || (mensajes[a.accionId] ?? '').trim().length < 10"
                >
                  Aprobar y enviar
                </button>
                <mat-form-field
                  ><mat-label>Motivo del rechazo</mat-label><input matInput [(ngModel)]="motivos[a.accionId]"
                /></mat-form-field>
                <button mat-stroked-button (click)="rechazar(a.accionId)" [disabled]="enviando()">Rechazar</button>
              </div>
            } @else {
              <p class="mensaje-final">“{{ a.mensaje }}”</p>
              @if (a.decididaPor) {
                <p class="secundario">Decidida {{ a.decididaEn | fecha: true }}{{ a.motivoRechazo ? ' · ' + a.motivoRechazo : '' }}</p>
              }
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="secundario">El agente no propuso acciones.</p>
      }
    </div>
  `,
  styles: `
    .lista {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .elegida {
      outline: 2px solid var(--mat-sys-primary);
    }
    .mensaje {
      width: 100%;
    }
    .evidencia {
      margin: 4px 0;
      font-size: 14px;
    }
    .mensaje-final {
      font-style: italic;
    }
  `,
})
export class AccionesPagina {
  private readonly fachada = inject(AccionesFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  readonly id = input<string>();
  readonly datos = this.fachada.datos;
  readonly visibles = computed(() => {
    const todas = this.fachada.acciones();
    for (const a of todas) if (a.estado === 'PENDIENTE' && this.mensajes[a.accionId] === undefined) this.mensajes[a.accionId] = a.mensaje;
    return conLaElegidaPrimero(todas, this.id());
  });
  readonly error = this.fachada.error;
  readonly campos = { accionesPropuestas: 'Analítica', viaje: 'Viajes' };
  readonly enviando = signal(false);
  mensajes: Record<string, string> = {};
  motivos: Record<string, string> = {};

  aprobar(id: string) {
    const mensaje = this.mensajes[id].trim();
    return this.enviar(() => this.fachada.aprobar(id, mensaje), 'Aprobada: el correo sale por n8n');
  }
  rechazar(id: string) {
    const motivo = this.motivos[id]?.trim() || undefined;
    return this.enviar(() => this.fachada.rechazar(id, motivo), 'Acción rechazada');
  }

  private async enviar(accion: () => Promise<unknown>, ok: string): Promise<void> {
    this.enviando.set(true);
    try {
      await accion();
      this.avisos.open(ok, undefined, { duration: 5000 });
      await this.fachada.recargar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
