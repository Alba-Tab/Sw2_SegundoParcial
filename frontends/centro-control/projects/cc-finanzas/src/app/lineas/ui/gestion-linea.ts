import { afterNextRender, Component, computed, type ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  BobPipe,
  Campo,
  codigoDe,
  Confirmacion,
  enfocar,
  erroresGraphql,
  largoEntre,
  listoParaEnviar,
  mensajeDe,
  montoConDecimales,
  montoMinimo,
  textoError,
  validarMonto,
} from 'ui-comun';
import type { Icono } from 'ui-comun/dominio';
import { disponibleCon, usadoDe, type AccionLinea, type ClienteConLinea, type Linea } from '../domain/linea';
import { LineasFachada } from '../lineas.fachada';

const BOTON: Record<AccionLinea, { texto: string; icono: Icono }> = {
  ajustar: { texto: 'Sí, cambiar el límite', icono: 'credit_score' },
  suspender: { texto: 'Sí, suspender la línea', icono: 'block' },
  reactivar: { texto: 'Sí, reactivar la línea', icono: 'replay' },
};

/**
 * G6 (spec 012): ajustar el límite o suspender/reactivar la línea de un cliente. Cada campo se valida al enviar (el
 * límite no baja de lo usado) y antes de mandar se confirma con un resumen; la clave de idempotencia la pone la fachada.
 */
@Component({
  selector: 'app-gestion-linea',
  imports: [
    ReactiveFormsModule,
    Campo,
    Confirmacion,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    BobPipe,
  ],
  template: `
    @let l = cliente().lineaCredito;
    <mat-card class="gestion" id="gestion-linea">
      <mat-card-header>
        <mat-card-title>Línea de {{ cliente().razonSocial }}</mat-card-title>
        <mat-card-subtitle>Usado {{ usado() | bob }} de {{ l.limite | bob }}{{ l.suspendida ? ' · suspendida' : '' }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="pedir('ajustar', formLinea)" #formLinea novalidate>
          <div class="fila-acciones">
            <mat-form-field>
              <mat-label>Límite nuevo (BOB)</mat-label>
              <input matInput #primerCampo formControlName="limite" inputmode="decimal" placeholder="50000.00" autocomplete="off" />
              <mat-hint>No menos que lo usado ({{ usado() | bob }})</mat-hint>
              <mat-error>{{ textoError(form.controls.limite) }}</mat-error>
            </mat-form-field>
            <mat-form-field class="motivo">
              <mat-label>Motivo</mat-label>
              <input matInput formControlName="motivo" autocomplete="off" />
              <mat-hint>De 3 a 300 caracteres; queda en la auditoría</mat-hint>
              <mat-error>{{ textoError(form.controls.motivo) }}</mat-error>
            </mat-form-field>
          </div>
          @if (accion(); as a) {
            <cc-confirmacion
              [resumen]="resumen(a, l)"
              [accion]="boton[a].texto"
              [icono]="boton[a].icono"
              [enviando]="enviando()"
              (confirmar)="enviar(a)"
              (volver)="volver()"
            />
          } @else {
            <div class="fila-acciones">
              <button mat-flat-button type="submit" id="ajustar-linea"><mat-icon>credit_score</mat-icon>Cambiar el límite</button>
              <button
                mat-stroked-button
                type="button"
                id="estado-linea"
                (click)="pedir(l.suspendida ? 'reactivar' : 'suspender', formLinea)"
              >
                <mat-icon>{{ l.suspendida ? 'replay' : 'block' }}</mat-icon
                >{{ l.suspendida ? 'Reactivar la línea' : 'Suspender la línea' }}
              </button>
              <button mat-button type="button" (click)="cerrar.emit()">Cancelar</button>
            </div>
          }
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .gestion {
      margin: 16px 0;
    }
    .motivo {
      flex: 1 1 320px;
    }
  `,
})
export class GestionLinea {
  private readonly fachada = inject(LineasFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly cliente = input.required<ClienteConLinea & { lineaCredito: Linea }>();
  readonly cerrar = output();
  readonly usado = computed(() => usadoDe(this.cliente().lineaCredito));
  /** La acción que espera confirmación; con ella abierta el formulario queda bloqueado (E-4). */
  readonly accion = signal<AccionLinea | null>(null);
  readonly enviando = signal(false);
  readonly boton = BOTON;
  readonly textoError = textoError;
  private readonly bob = new BobPipe();
  private readonly primerCampo = viewChild<ElementRef<HTMLInputElement>>('primerCampo');
  readonly form = new FormGroup({
    limite: new FormControl('', { nonNullable: true, validators: [Validators.required, validarMonto, montoMinimo(() => this.usado())] }),
    motivo: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 300)] }),
  });

  constructor() {
    afterNextRender(() => this.primerCampo()?.nativeElement.focus());
  }

  /** Ajustar valida los dos campos; suspender o reactivar, solo el motivo. Con datos válidos, pide confirmar. */
  pedir(accion: AccionLinea, raiz: HTMLElement): void {
    this.form.controls.limite.updateValueAndValidity();
    if (!listoParaEnviar(accion === 'ajustar' ? this.form : this.form.controls.motivo, raiz)) return;
    this.form.disable();
    this.accion.set(accion);
  }

  /** "No, volver" o un envío fallido: desbloquea el formulario y el foco vuelve al botón de la acción (E-3). */
  volver(): void {
    const a = this.accion();
    this.form.enable();
    this.accion.set(null);
    enfocar(a === 'ajustar' ? 'ajustar-linea' : 'estado-linea');
  }

  resumen(a: AccionLinea, l: Linea): string {
    const razon = this.cliente().razonSocial;
    if (a === 'suspender')
      return `Se suspende la línea de crédito de ${razon}: sus servicios nuevos se rechazarán hasta reactivarla. Lo ya reservado sigue su curso.`;
    if (a === 'reactivar') return `Se reactiva la línea de crédito de ${razon}: sus servicios nuevos vuelven a reservar crédito.`;
    const limite = montoConDecimales(this.form.getRawValue().limite);
    return (
      `El límite de ${razon} pasa de ${this.bob.transform(l.limite)} a ${this.bob.transform(limite)}; ` +
      `el disponible queda en ${this.bob.transform(disponibleCon(limite, this.usado()))}.`
    );
  }

  async enviar(a: AccionLinea): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    const { limite, motivo } = this.form.getRawValue();
    const clienteId = this.cliente().clienteId;
    try {
      if (a === 'ajustar') await this.fachada.ajustar(clienteId, montoConDecimales(limite), motivo.trim());
      else await this.fachada.cambiarEstado(clienteId, a === 'suspender', motivo.trim());
      this.avisos.open(a === 'ajustar' ? 'Límite actualizado' : a === 'suspender' ? 'Línea suspendida' : 'Línea reactivada', undefined, {
        duration: 5000,
      });
      // El cambio ya quedó: si la relectura falla, la lista se pone al día en el próximo sondeo.
      await this.fachada.recargar().catch(() => undefined);
      this.cerrar.emit();
    } catch (e) {
      this.volver();
      await this.explicarFallo(e);
    } finally {
      this.enviando.set(false);
    }
  }

  /** LIMITE_MENOR_QUE_USADO o CONFLICTO_ESTADO: otra operación cambió la línea; se relee y se dice con el dato nuevo. */
  private async explicarFallo(e: unknown): Promise<void> {
    const codigo = codigoDe(e);
    if (codigo === 'LIMITE_MENOR_QUE_USADO' || codigo === 'CONFLICTO_ESTADO') await this.fachada.recargar().catch(() => undefined);
    const usado = (erroresGraphql(e)[0]?.extensions?.['usado'] as { monto?: unknown } | undefined)?.monto;
    const detalle = codigo === 'LIMITE_MENOR_QUE_USADO' && typeof usado === 'string' ? ` Lo usado es ${this.bob.transform(usado)}.` : '';
    this.form.controls.limite.updateValueAndValidity();
    this.avisos.open(mensajeDe(e) + detalle, 'Cerrar');
  }
}
