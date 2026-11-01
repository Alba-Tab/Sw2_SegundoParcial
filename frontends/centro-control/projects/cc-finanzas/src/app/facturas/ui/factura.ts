import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  BobPipe,
  Confirmacion,
  Encabezado,
  Esqueleto,
  Estado,
  etiqueta,
  EtiquetaPipe,
  fechaLaPaz,
  FechaPipe,
  largoEntre,
  listoParaEnviar,
  mensajeDe,
  montoConDecimales,
  Sesion,
  textoError,
  validarMonto,
} from 'ui-comun';
import { completarConRecibo } from '../domain/recibo';
import { MEDIOS_PAGO, saldoDespuesDe, type PagoEnEdicion } from '../domain/pago';
import { FacturaFachada } from '../facturas.fachada';

/**
 * Spec 008: administración registra un pago (baja el saldo y libera crédito). El OCR del recibo (Tesseract.js en el
 * navegador) propone monto, fecha y referencia; la persona los revisa antes de guardar.
 */
@Component({
  selector: 'app-factura',
  providers: [FacturaFachada],
  imports: [
    Esqueleto,
    Encabezado,
    ReactiveFormsModule,
    Confirmacion,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
    BobPipe,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    @let titulo = factura()?.numero ?? 'Factura';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Facturas', ruta: '/facturas' }, { texto: titulo }]">
      @if (factura(); as f) {
        <cc-estado grupo="EstadoFactura" [valor]="f.estado" />
      }
      @if (puedeRegistrar()) {
        <button
          mat-flat-button
          #botonPago
          (click)="registrando() ? cerrar() : registrando.set(true)"
          [attr.aria-expanded]="registrando()"
          aria-controls="registrar-pago"
        >
          <mat-icon>price_check</mat-icon>Registrar pago
        </button>
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!factura()" />
    @if (factura(); as f) {
      <dl class="datos">
        <div>
          <dt>Cliente</dt>
          <dd>{{ f.razonSocial }}</dd>
        </div>
        <div>
          <dt>Emitida</dt>
          <dd>{{ f.emitidaEl | fecha }}</dd>
        </div>
        <div>
          <dt>Monto</dt>
          <dd>{{ f.monto | bob }}</dd>
        </div>
        <div>
          <dt>Saldo</dt>
          <dd>{{ f.saldo | bob }}</dd>
        </div>
        <div>
          <dt>Vence</dt>
          <dd>{{ f.venceEl | fecha }}</dd>
        </div>
      </dl>

      @if (registrando() && puedeRegistrar()) {
        <mat-card class="pago" id="registrar-pago">
          <mat-card-header><mat-card-title>Registrar pago</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="fila-acciones">
              <label class="recibo" mat-stroked-button>
                <mat-icon>document_scanner</mat-icon>Leer recibo (OCR)
                <input type="file" accept="image/*" (change)="ocr($event)" hidden />
              </label>
              @if (leyendo()) {
                <span class="secundario">Leyendo el recibo en el navegador…</span>
              }
            </div>
            @if (leyendo()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <form [formGroup]="form" (ngSubmit)="revisar(formPago)" #formPago novalidate>
              <div class="fila-acciones">
                <mat-form-field>
                  <mat-label>Monto (BOB)</mat-label>
                  <input matInput formControlName="monto" inputmode="decimal" placeholder="2800.50" autocomplete="off" />
                  <mat-hint>Con punto decimal</mat-hint>
                  <mat-error>{{ textoError(form.controls.monto) }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Fecha</mat-label>
                  <input matInput type="date" formControlName="fecha" />
                  <mat-error>{{ textoError(form.controls.fecha) }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Medio</mat-label>
                  <mat-select formControlName="medio">
                    @for (m of medios; track m) {
                      <mat-option [value]="m">{{ m | etiqueta: 'MedioPago' }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Referencia</mat-label>
                  <input matInput formControlName="referencia" autocomplete="off" />
                  <mat-error>{{ textoError(form.controls.referencia) }}</mat-error>
                </mat-form-field>
              </div>
              @if (confirmando()) {
                <cc-confirmacion
                  [resumen]="resumen(f)"
                  accion="Sí, registrar el pago"
                  icono="price_check"
                  [enviando]="enviando()"
                  (confirmar)="registrar(f.facturaId)"
                  (volver)="confirmando.set(false)"
                />
              } @else {
                <div class="fila-acciones">
                  <button mat-flat-button type="submit"><mat-icon>price_check</mat-icon>Guardar el pago</button>
                  <button mat-button type="button" (click)="cerrar()">Cancelar</button>
                </div>
              }
            </form>
          </mat-card-content>
        </mat-card>
      }

      <h2>Pagos</h2>
      @for (p of f.pagos ?? []; track p.pagoId) {
        <p>
          {{ p.fecha | fecha }} · {{ p.monto | bob }} · {{ p.medio | etiqueta: 'MedioPago' }} · {{ p.referencia }}
          <span class="secundario">{{ p.nota ?? '' }}</span>
        </p>
      } @empty {
        <p class="secundario">Sin pagos.</p>
      }
    }
  `,
  styles: `
    .pago {
      margin: 16px 0;
    }
    .recibo {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  `,
})
export class FacturaPagina {
  private readonly fachada = inject(FacturaFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  readonly factura = this.fachada.factura;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { factura: 'Finanzas' };
  readonly medios = MEDIOS_PAGO;
  readonly enviando = signal(false);
  readonly leyendo = signal(false);
  /** El formulario de pago se abre desde la acción del encabezado; solo administración y con saldo. */
  readonly registrando = signal(false);
  readonly puedeRegistrar = computed(() => this.sesion.tiene('administracion') && !!this.factura() && this.factura()!.saldo !== '0.00');
  /** Registrar un pago no se deshace: antes de enviarlo se muestra el resumen y se pide confirmar. */
  readonly confirmando = signal(false);
  readonly textoError = textoError;
  private readonly bob = new BobPipe();
  private readonly botonPago = viewChild<MatButton>('botonPago');
  readonly form = new FormGroup({
    monto: new FormControl('', { nonNullable: true, validators: [Validators.required, validarMonto] }),
    fecha: new FormControl(fechaLaPaz(), { nonNullable: true, validators: [Validators.required] }),
    medio: new FormControl<PagoEnEdicion['medio']>('TRANSFERENCIA', { nonNullable: true }),
    referencia: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(1, 100)] }),
  });

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  async ocr(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.leyendo.set(true);
    try {
      this.form.setValue(completarConRecibo(this.form.getRawValue(), await this.fachada.leerRecibo(archivo)));
      this.avisos.open('Revisa los datos leídos del recibo antes de registrar', undefined, { duration: 5000 });
    } catch {
      this.avisos.open('No se pudo leer el recibo; completa los datos a mano', 'Cerrar', { duration: 6000 });
    } finally {
      this.leyendo.set(false);
    }
  }

  revisar(raiz: HTMLElement): void {
    if (listoParaEnviar(this.form, raiz)) this.confirmando.set(true);
  }

  resumen(f: { numero: string; saldo: string }): string {
    const p = this.form.getRawValue();
    const saldo = saldoDespuesDe(f.saldo, p.monto);
    return (
      `Se registra un pago de ${this.bob.transform(montoConDecimales(p.monto))} por ${etiqueta('MedioPago', p.medio).texto.toLowerCase()} ` +
      `con referencia ${p.referencia.trim()} en la factura ${f.numero}. El saldo queda en ${this.bob.transform(saldo)}. No se puede deshacer.`
    );
  }

  /** Cierra el formulario y devuelve el foco al botón que lo abrió. */
  cerrar(): void {
    this.registrando.set(false);
    this.confirmando.set(false);
    this.botonPago()?.focus();
  }

  async registrar(facturaId: string): Promise<void> {
    if (!this.form.valid) return;
    this.enviando.set(true);
    try {
      const p = this.form.getRawValue();
      await this.fachada.registrarPago(facturaId, { ...p, monto: montoConDecimales(p.monto), referencia: p.referencia.trim() });
      this.avisos.open('Pago registrado: se liberó el crédito', undefined, { duration: 5000 });
      this.form.reset({ fecha: p.fecha, medio: p.medio });
      this.cerrar();
      await this.fachada.recargar();
    } catch (e) {
      this.confirmando.set(false);
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
