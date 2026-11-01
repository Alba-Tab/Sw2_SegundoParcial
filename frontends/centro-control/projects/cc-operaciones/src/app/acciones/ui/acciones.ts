import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  Campo,
  CONFIG_CENTRO,
  Confirmacion,
  controlLista,
  Encabezado,
  enfocar,
  enfocarTitulo,
  Estado,
  FechaPipe,
  FiltrosLista,
  largoEntre,
  listoParaEnviar,
  mensajeDe,
  PieLista,
  Sesion,
  textoError,
} from 'ui-comun';
import { AccionesFachada } from '../acciones.fachada';
import { conLaElegidaPrimero, type Accion } from '../domain/accion';

/**
 * CU-18 (spec 014): el agente propone; el despachador revisa la evidencia, edita el mensaje y aprueba (sale el correo
 * por n8n) o rechaza. El gerente solo mira (propuesta 7.2).
 */
@Component({
  selector: 'app-acciones',
  providers: [AccionesFachada],
  imports: [
    Encabezado,
    ReactiveFormsModule,
    Campo,
    Confirmacion,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    RouterLink,
    FechaPipe,
    Estado,
    AvisoServicios,
    FiltrosLista,
    PieLista,
  ],
  template: `
    <cc-encabezado
      [titulo]="id() ? 'Acción propuesta' : 'Acciones del agente'"
      [migas]="id() ? [{ texto: 'Acciones del agente', ruta: '/acciones' }, { texto: 'Acción propuesta' }] : []"
    />
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!visibles().length" [reintentar]="recargar" />
    <cc-filtros-lista [control]="lista" busqueda="Buscar por cliente o placa" grupo="EstadoAccion" nombre="acciones" singular="acción" />
    <div class="lista">
      @for (a of lista.visibles(); track a.accionId) {
        <mat-card [class.elegida]="a.accionId === id()">
          <mat-card-header>
            <mat-card-title>Avisar retraso a {{ a.razonSocial }}</mat-card-title>
            <mat-card-subtitle>
              <cc-estado grupo="EstadoAccion" [valor]="a.estado" />
              · {{ a.creadaEn | fecha: true }} · viaje
              <a [routerLink]="['/viajes', a.viajeId]" [queryParams]="{ de: 'acciones' }">{{ a.viaje?.placa ?? 'sin unidad' }}</a>
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
              @let f = formDe(a);
              <div [formGroup]="f" #zona>
                <mat-form-field class="mensaje">
                  <mat-label>Mensaje al cliente</mat-label>
                  <textarea matInput rows="3" formControlName="mensaje"></textarea>
                  <mat-hint>De 10 a 1.000 caracteres</mat-hint>
                  <mat-error>{{ textoError(f.controls.mensaje) }}</mat-error>
                </mat-form-field>
                <div class="fila-acciones">
                  <button mat-flat-button (click)="aprobar(a.accionId, zona)" [disabled]="enviando()">
                    <mat-icon>send</mat-icon>Aprobar y enviar
                  </button>
                  <mat-form-field>
                    <mat-label>Motivo del rechazo</mat-label>
                    <input matInput formControlName="motivo" />
                    <mat-error>{{ textoError(f.controls.motivo) }}</mat-error>
                  </mat-form-field>
                  @if (rechazando() !== a.accionId) {
                    <button
                      mat-stroked-button
                      [id]="'rechazar-' + a.accionId"
                      (click)="pedirRechazo(a.accionId, zona)"
                      [disabled]="enviando()"
                    >
                      <mat-icon>block</mat-icon>Rechazar
                    </button>
                  }
                </div>
                @if (rechazando() === a.accionId) {
                  <cc-confirmacion
                    [resumen]="'Se rechaza el aviso de retraso a ' + a.razonSocial + ': no se envía ningún correo. No se puede deshacer.'"
                    accion="Sí, rechazar la acción"
                    icono="block"
                    [enviando]="enviando()"
                    (confirmar)="rechazar(a.accionId)"
                    (volver)="volver(a.accionId)"
                  />
                }
              </div>
            } @else {
              <p class="mensaje-final">“{{ a.mensaje }}”</p>
              @if (a.decididaPor) {
                <p class="secundario">Decidida {{ a.decididaEn | fecha: true }}{{ a.motivoRechazo ? ' · ' + a.motivoRechazo : '' }}</p>
              }
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
    <cc-pie-lista [control]="lista" nombre="acciones" vacio="El agente no propuso acciones." [error]="error()" [cargando]="cargando()" />
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
  readonly visibles = computed(() => conLaElegidaPrimero(this.fachada.acciones(), this.id()));
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly lista = controlLista<Accion>({
    filas: this.visibles,
    texto: (a) => [a.razonSocial, a.viaje?.placa, a.viaje?.ruta?.destino].filter(Boolean).join(' '),
    estado: (a) => a.estado,
  });
  readonly campos = { accionesPropuestas: 'Analítica', viaje: 'Viajes' };
  readonly enviando = signal(false);
  /** Rechazar no se deshace: la acción que está pidiendo confirmación. */
  readonly rechazando = signal<string | null>(null);
  readonly textoError = textoError;
  private readonly forms: Record<string, ReturnType<typeof formularioAccion>> = {};
  readonly recargar = () => this.fachada.recargar();

  /** El formulario de cada acción pendiente, con el mensaje que propuso el agente para editarlo. */
  formDe(a: Accion) {
    return (this.forms[a.accionId] ??= formularioAccion(a.mensaje));
  }

  aprobar(id: string, zona: HTMLElement) {
    const f = this.forms[id];
    if (!listoParaEnviar(f.controls.mensaje, zona)) return;
    const mensaje = f.controls.mensaje.value.trim();
    return this.enviar(() => this.fachada.aprobar(id, mensaje), 'Aprobada: el correo sale por n8n');
  }
  /** Pide confirmar con el formulario bloqueado: el motivo no cambia después de leer el resumen (E-4). */
  pedirRechazo(id: string, zona: HTMLElement): void {
    if (!listoParaEnviar(this.forms[id].controls.motivo, zona)) return;
    this.forms[id].disable();
    this.rechazando.set(id);
  }
  /** "No, volver" o un rechazo fallido: desbloquea y el foco vuelve a "Rechazar" (E-3). */
  volver(id: string): void {
    this.forms[id]?.enable();
    this.rechazando.set(null);
    enfocar(`rechazar-${id}`);
  }
  rechazar(id: string) {
    const motivo = this.forms[id].controls.motivo.value.trim() || undefined;
    return this.enviar(() => this.fachada.rechazar(id, motivo), 'Acción rechazada', id);
  }

  private async enviar(accion: () => Promise<unknown>, ok: string, rechazo?: string): Promise<void> {
    this.enviando.set(true);
    try {
      await accion();
      this.rechazando.set(null);
      this.avisos.open(ok, undefined, { duration: 5000 });
      await this.fachada.recargar();
      // La acción queda decidida y sus botones desaparecen: el foco va al título de la página.
      enfocarTitulo();
    } catch (e) {
      if (rechazo) this.volver(rechazo);
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}

/** Mensaje de 10 a 1.000 caracteres (spec 014); el motivo del rechazo es opcional. */
function formularioAccion(mensaje: string) {
  return new FormGroup({
    mensaje: new FormControl(mensaje, { nonNullable: true, validators: [Validators.required, largoEntre(10, 1000)] }),
    motivo: new FormControl('', { nonNullable: true, validators: [largoEntre(0, 300)] }),
  });
}
