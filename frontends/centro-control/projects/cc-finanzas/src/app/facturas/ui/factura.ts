import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  BobPipe,
  Campo,
  codigoDe,
  erroresGraphql,
  Confirmacion,
  Encabezado,
  Esqueleto,
  Estado,
  EtiquetaPipe,
  fechaEntre,
  fechaLaPaz,
  FechaPipe,
  largoEntre,
  enfocar,
  enfocarTitulo,
  listoParaEnviar,
  mensajeDe,
  montoConDecimales,
  montoMaximo,
  Sesion,
  textoError,
  validarMonto,
} from 'ui-comun';
import { completarConRecibo } from '../domain/recibo';
import { MEDIOS_PAGO, medioEnFrase, pagoRepetido, saldoDelError, saldoDespuesDe, type PagoEnEdicion } from '../domain/pago';
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
    Campo,
    Confirmacion,
    MatTableModule,
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
          mat-stroked-button
          #botonPago
          (click)="registrando() ? cerrar() : abrir()"
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
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!factura()" [reintentar]="recargar" />
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
              <!-- Un botón de verdad (no un label) para que se alcance con el teclado; abre el selector de archivo. -->
              <button mat-stroked-button type="button" (click)="archivo.click()" [disabled]="leyendo() || confirmando()">
                <mat-icon>document_scanner</mat-icon>Leer recibo (OCR)
              </button>
              <input #archivo type="file" accept="image/*" (change)="ocr($event)" hidden />
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
                  <input matInput #primerCampo formControlName="monto" inputmode="decimal" placeholder="2800.50" autocomplete="off" />
                  <mat-hint>Con punto decimal</mat-hint>
                  <mat-error>{{ textoError(form.controls.monto) }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Fecha</mat-label>
                  <input matInput type="date" formControlName="fecha" [min]="f.emitidaEl.slice(0, 10)" [max]="hoy" />
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
              <mat-form-field class="nota">
                <mat-label>Nota (opcional)</mat-label>
                <input matInput formControlName="nota" autocomplete="off" />
                <mat-hint>Hasta 300 caracteres</mat-hint>
                <mat-error>{{ textoError(form.controls.nota) }}</mat-error>
              </mat-form-field>
              @if (confirmando()) {
                <cc-confirmacion
                  [resumen]="resumen(f)"
                  accion="Sí, registrar el pago"
                  icono="price_check"
                  [enviando]="enviando()"
                  (confirmar)="registrar(f.facturaId)"
                  (volver)="volver()"
                />
              } @else {
                <div class="fila-acciones">
                  <button mat-flat-button type="submit" id="guardar-pago"><mat-icon>price_check</mat-icon>Guardar el pago</button>
                  <button mat-button type="button" (click)="cerrar()">Cancelar</button>
                </div>
              }
            </form>
          </mat-card-content>
        </mat-card>
      }

      <h2 id="titulo-pagos" tabindex="-1">Pagos</h2>
      @if (f.pagos?.length) {
        <div class="tabla-ancha" role="region" aria-labelledby="titulo-pagos" tabindex="0">
          <table mat-table [dataSource]="f.pagos!" aria-labelledby="titulo-pagos">
            <ng-container matColumnDef="fecha"
              ><th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let p">{{ p.fecha | fecha }}</td></ng-container
            >
            <ng-container matColumnDef="monto"
              ><th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let p">{{ p.monto | bob }}</td></ng-container
            >
            <ng-container matColumnDef="medio"
              ><th mat-header-cell *matHeaderCellDef>Medio</th>
              <td mat-cell *matCellDef="let p">{{ p.medio | etiqueta: 'MedioPago' }}</td></ng-container
            >
            <ng-container matColumnDef="referencia"
              ><th mat-header-cell *matHeaderCellDef>Referencia</th>
              <td mat-cell *matCellDef="let p">
                {{ p.referencia }}
                @if (p.pagoId === repetido()) {
                  <span class="cdk-visually-hidden"> (ya registrado)</span>
                }
              </td></ng-container
            >
            <ng-container matColumnDef="nota"
              ><th mat-header-cell *matHeaderCellDef>Nota</th>
              <td mat-cell *matCellDef="let p" class="secundario">{{ p.nota ?? '' }}</td></ng-container
            >
            <tr mat-header-row *matHeaderRowDef="columnasPagos"></tr>
            <tr mat-row *matRowDef="let p; columns: columnasPagos" [class.repetido]="p.pagoId === repetido()"></tr>
          </table>
        </div>
      } @else {
        <p class="secundario">Sin pagos.</p>
      }
    }
  `,
  styles: `
    .pago {
      margin: 16px 0;
    }
    .nota {
      width: 100%;
    }
    .repetido {
      background: var(--mat-sys-advertencia-container);
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
  readonly hoy = fechaLaPaz();
  readonly columnasPagos = ['fecha', 'monto', 'medio', 'referencia', 'nota'];
  readonly recargar = () => this.fachada.recargar();
  private readonly bob = new BobPipe();
  private readonly fecha = new FechaPipe();
  /** El pago con el que chocó un PAGO_DUPLICADO: se marca en la tabla de pagos (spec 008). */
  readonly repetido = signal<string | undefined>(undefined);
  private readonly botonPago = viewChild<MatButton>('botonPago');
  private readonly primerCampo = viewChild<ElementRef<HTMLInputElement>>('primerCampo');
  private readonly injector = inject(Injector);
  readonly form = new FormGroup({
    // Spec 008: monto > 0 y ≤ saldo; fecha entre la emisión y hoy; referencia de 3 a 40 caracteres.
    monto: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, validarMonto, montoMaximo(() => this.factura()?.saldo)],
    }),
    fecha: new FormControl(fechaLaPaz(), {
      nonNullable: true,
      validators: [Validators.required, fechaEntre(() => this.factura()?.emitidaEl, fechaLaPaz)],
    }),
    medio: new FormControl<PagoEnEdicion['medio']>('TRANSFERENCIA', { nonNullable: true }),
    referencia: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 40)] }),
    nota: new FormControl('', { nonNullable: true, validators: [largoEntre(0, 300)] }),
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
      this.avisos.open('No se pudo leer el recibo; completa los datos a mano', 'Cerrar');
    } finally {
      this.leyendo.set(false);
    }
  }

  /** Con datos válidos, pide la confirmación con el formulario bloqueado: el resumen no cambia bajo el usuario (E-4). */
  revisar(raiz: HTMLElement): void {
    // El saldo y la fecha de emisión pueden haber llegado después de escribir: se vuelve a validar cada campo.
    for (const c of Object.values(this.form.controls)) c.updateValueAndValidity();
    if (!listoParaEnviar(this.form, raiz)) return;
    this.form.disable();
    this.confirmando.set(true);
  }

  /** "No, volver" o un envío fallido: desbloquea el formulario y el foco vuelve a "Guardar el pago" (E-3). */
  volver(): void {
    this.form.enable();
    this.confirmando.set(false);
    enfocar('guardar-pago');
  }

  resumen(f: { numero: string; saldo: string }): string {
    const p = this.form.getRawValue();
    const saldo = saldoDespuesDe(f.saldo, p.monto);
    return (
      `Se registra un pago de ${this.bob.transform(montoConDecimales(p.monto))} ${medioEnFrase(p.medio)} ` +
      `con referencia ${p.referencia.trim()} en la factura ${f.numero}. El saldo queda en ${this.bob.transform(saldo)}. No se puede deshacer.`
    );
  }

  /** Abre el formulario con el foco en el monto: aparece debajo de los datos, fuera de la vista en móvil (C-7). */
  abrir(): void {
    this.registrando.set(true);
    afterNextRender(() => this.primerCampo()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Cierra el formulario y devuelve el foco al botón que lo abrió. */
  cerrar(): void {
    this.form.enable();
    this.registrando.set(false);
    this.confirmando.set(false);
    this.botonPago()?.focus();
  }

  async registrar(facturaId: string): Promise<void> {
    this.enviando.set(true);
    try {
      const p = this.form.getRawValue();
      await this.fachada.registrarPago(facturaId, {
        ...p,
        monto: montoConDecimales(p.monto),
        referencia: p.referencia.trim(),
        nota: p.nota.trim() || undefined,
      });
      this.avisos.open('Pago registrado: se liberó el crédito', undefined, { duration: 5000 });
      this.repetido.set(undefined);
      this.form.reset({ fecha: p.fecha, medio: p.medio });
      this.cerrar();
      await this.fachada.recargar();
      // Con saldo 0 el botón "Registrar pago" ya no está: el foco va al título de la factura.
      if (!this.puedeRegistrar()) enfocarTitulo();
    } catch (e) {
      this.volver();
      await this.explicarFallo(e);
    } finally {
      this.enviando.set(false);
    }
  }

  /** Spec 008: el saldo actual si el monto lo supera, y el pago existente si la referencia ya estaba. */
  private async explicarFallo(e: unknown): Promise<void> {
    const codigo = codigoDe(e);
    const ext = erroresGraphql(e)[0]?.extensions ?? {};
    if (codigo === 'PAGO_EXCEDE_SALDO') {
      // Otro pago bajó el saldo: se relee antes de decirlo, y el monto se vuelve a validar contra el saldo nuevo (V2-5).
      await this.fachada.recargar().catch(() => undefined);
      const saldo = saldoDelError(ext['saldo'], this.factura()?.saldo);
      this.form.controls.monto.updateValueAndValidity();
      this.form.controls.monto.markAsTouched();
      this.avisos.open(mensajeDe(e) + (saldo ? ` El saldo es ${this.bob.transform(saldo)}.` : ''), 'Cerrar');
      return;
    }
    if (codigo !== 'PAGO_DUPLICADO') {
      this.avisos.open(mensajeDe(e), 'Cerrar');
      return;
    }
    await this.fachada.recargar();
    const p = this.form.getRawValue();
    const existente = pagoRepetido(this.factura()?.pagos ?? [], ext['pagoId'], p.medio, p.referencia);
    this.repetido.set(existente?.pagoId);
    const texto = existente
      ? `Ese pago ya está registrado: ${this.bob.transform(existente.monto)} del ${this.fecha.transform(existente.fecha)} ` +
        `${medioEnFrase(existente.medio)}, referencia ${existente.referencia}. Está marcado en Pagos.`
      : `${mensajeDe(e)} Revisa la lista de pagos de esta factura.`;
    this.avisos
      .open(texto, 'Ver pagos')
      .onAction()
      .subscribe(() => enfocar('titulo-pagos'));
  }
}
