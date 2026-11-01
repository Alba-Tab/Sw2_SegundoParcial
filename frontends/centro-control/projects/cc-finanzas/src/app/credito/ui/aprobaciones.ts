import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  BobPipe,
  Campo,
  Confirmacion,
  ConfirmacionUnica,
  controlLista,
  Encabezado,
  enfocar,
  enfocarTitulo,
  Estado,
  EtiquetaPipe,
  exigirTexto,
  FechaPipe,
  FiltrosLista,
  largoEntre,
  mensajeDe,
  PieLista,
  Sesion,
  textoError,
} from 'ui-comun';
import { CreditoFachada } from '../credito.fachada';

/** Spec 012 (paso 2b de la saga): cliente en mora; administración aprueba o rechaza antes de que venza la espera. */
@Component({
  selector: 'app-aprobaciones',
  providers: [CreditoFachada],
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
    <cc-aviso-servicios
      [error]="error()"
      [datosAl]="datosAl()"
      [campos]="campos"
      [sinDatos]="!solicitudes().length"
      [reintentar]="recargar"
    />
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
              @let motivo = motivoDe(s.servicioId);
              <div #zona>
                <mat-form-field class="ancho">
                  <mat-label>Motivo</mat-label>
                  <input matInput [formControl]="motivo" />
                  <mat-hint>Obligatorio para rechazar (3 a 300 caracteres)</mat-hint>
                  <mat-error>{{ textoError(motivo) }}</mat-error>
                </mat-form-field>
                @if (rechazando() === s.servicioId) {
                  <cc-confirmacion
                    [resumen]="
                      'Se rechaza el crédito de ' +
                      s.razonSocial +
                      ' por ' +
                      (s.monto | bob) +
                      ' con el motivo «' +
                      motivo.value.trim() +
                      '»: el servicio se cancela. No se puede deshacer.'
                    "
                    accion="Sí, rechazar el crédito"
                    icono="block"
                    [enviando]="enviando()"
                    (confirmar)="decidir(s.servicioId, false, zona)"
                    (volver)="volver(s.servicioId)"
                  />
                } @else {
                  <div class="fila-acciones">
                    <button mat-flat-button (click)="decidir(s.servicioId, true, zona)" [disabled]="enviando()" disabledInteractive>
                      <mat-icon>thumb_up</mat-icon>Aprobar
                    </button>
                    <button
                      mat-stroked-button
                      [id]="'rechazar-' + s.servicioId"
                      (click)="pedirRechazo(s.servicioId, zona)"
                      [disabled]="enviando()"
                    >
                      <mat-icon>block</mat-icon>Rechazar
                    </button>
                  </div>
                }
              </div>
            } @else if (s.decididaPor) {
              <p class="secundario">Decidida por {{ s.decididaPor }} {{ s.motivoDecision ?? '' }}</p>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
    <cc-pie-lista
      [control]="lista"
      nombre="solicitudes"
      vacio="No hay solicitudes de aprobación."
      [error]="error()"
      [cargando]="cargando()"
    />
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
  readonly datosAl = this.fachada.datosAl;
  readonly cargando = this.fachada.cargando;
  readonly campos = { solicitudesAprobacion: 'Finanzas' };
  readonly lista = controlLista({
    filas: this.solicitudes,
    texto: (s) => s.razonSocial ?? '',
    estado: (s) => s.estado,
  });
  readonly enviando = signal(false);
  readonly textoError = textoError;
  private readonly motivos: Record<string, FormControl<string>> = {};
  /**
   * Rechazar un crédito no se deshace (la saga cancela el servicio, spec 012): la solicitud que pide confirmación. Una a
   * la vez: pedir otra libera el motivo de la anterior (V2-2).
   */
  private readonly confirmacion = new ConfirmacionUnica((id) => this.motivoDe(id));
  readonly rechazando = this.confirmacion.abierta;
  readonly recargar = () => this.fachada.recargar();

  motivoDe(servicioId: string): FormControl<string> {
    return (this.motivos[servicioId] ??= new FormControl('', { nonNullable: true, validators: [largoEntre(0, 300)] }));
  }

  /** Con el motivo válido, pide confirmar con el campo bloqueado (E-4, E-11). */
  pedirRechazo(servicioId: string, zona: HTMLElement): void {
    if (!exigirTexto(this.motivoDe(servicioId), 3, 300, zona)) return;
    this.confirmacion.abrir(servicioId);
  }

  /** "No, volver" o un rechazo fallido: el campo se desbloquea y el foco vuelve a "Rechazar" (E-3). */
  volver(servicioId: string): void {
    this.confirmacion.cerrar(servicioId);
    enfocar(`rechazar-${servicioId}`);
  }

  /** El motivo es opcional para aprobar y obligatorio (3 o más) para rechazar. */
  async decidir(servicioId: string, aprobado: boolean, zona: HTMLElement): Promise<void> {
    if (this.enviando()) return;
    const control = this.motivoDe(servicioId);
    // El rechazo se validó al pedir la confirmación y el motivo sigue bloqueado mientras se envía (V2-7).
    if (aprobado && !exigirTexto(control, 0, 300, zona)) return;
    this.enviando.set(true);
    try {
      await this.fachada.decidir(servicioId, aprobado, control.getRawValue().trim() || undefined);
      this.confirmacion.cerrar(servicioId);
      this.avisos.open(aprobado ? 'Crédito aprobado: la saga sigue' : 'Crédito rechazado', undefined, { duration: 5000 });
      await this.fachada.recargar();
      // La solicitud queda decidida y sus botones desaparecen: el foco va al título de la página.
      enfocarTitulo();
    } catch (e) {
      if (this.rechazando() === servicioId) this.volver(servicioId);
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
