import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AvisoServicios, BobPipe, FechaPipe, mensajeDe, Sesion } from 'ui-comun';
import { completarConRecibo } from '../domain/recibo';
import { MEDIOS_PAGO, pagoNuevo, pagoValido } from '../domain/pago';
import { FacturaFachada } from '../facturas.fachada';

/**
 * Spec 008: administración registra un pago (baja el saldo y libera crédito). El OCR del recibo (Tesseract.js en el
 * navegador) propone monto, fecha y referencia; la persona los revisa antes de guardar.
 */
@Component({
  selector: 'app-factura',
  providers: [FacturaFachada],
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
    BobPipe,
    FechaPipe,
    AvisoServicios,
  ],
  template: `
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!factura()" />
    @if (factura(); as f) {
      <h1>
        {{ f.numero }} · <span class="chip-estado">{{ f.estado }}</span>
      </h1>
      <p>{{ f.razonSocial }} · emitida {{ f.emitidaEl | fecha }} · vence {{ f.venceEl | fecha }}</p>
      <p><b>Monto:</b> {{ f.monto | bob }} · <b>Saldo:</b> {{ f.saldo | bob }}</p>

      @if (sesion.tiene('administracion') && f.saldo !== '0.00') {
        <mat-card class="pago">
          <mat-card-header><mat-card-title>Registrar pago</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="fila-acciones">
              <label class="recibo" mat-stroked-button>
                <mat-icon>document_scanner</mat-icon> Leer recibo (OCR)
                <input type="file" accept="image/*" (change)="ocr($event)" hidden />
              </label>
              @if (leyendo()) {
                <span class="secundario">Leyendo el recibo en el navegador…</span>
              }
            </div>
            @if (leyendo()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <div class="fila-acciones">
              <mat-form-field
                ><mat-label>Monto (BOB)</mat-label><input matInput [(ngModel)]="pago.monto" placeholder="2800.00"
              /></mat-form-field>
              <mat-form-field><mat-label>Fecha</mat-label><input matInput type="date" [(ngModel)]="pago.fecha" /></mat-form-field>
              <mat-form-field
                ><mat-label>Medio</mat-label>
                <mat-select [(ngModel)]="pago.medio">
                  @for (m of medios; track m) {
                    <mat-option [value]="m">{{ m }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field><mat-label>Referencia</mat-label><input matInput [(ngModel)]="pago.referencia" /></mat-form-field>
            </div>
            <button mat-flat-button (click)="registrar(f.facturaId)" [disabled]="enviando() || !valido()">Registrar pago</button>
          </mat-card-content>
        </mat-card>
      }

      <h2>Pagos</h2>
      @for (p of f.pagos ?? []; track p.pagoId) {
        <p>
          {{ p.fecha | fecha }} · {{ p.monto | bob }} · {{ p.medio }} · {{ p.referencia }}
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
  readonly campos = { factura: 'Finanzas' };
  readonly medios = MEDIOS_PAGO;
  readonly enviando = signal(false);
  readonly leyendo = signal(false);
  pago = pagoNuevo();

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  valido(): boolean {
    return pagoValido(this.pago);
  }

  async ocr(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.leyendo.set(true);
    try {
      this.pago = completarConRecibo(this.pago, await this.fachada.leerRecibo(archivo));
      this.avisos.open('Revisa los datos leídos del recibo antes de registrar', undefined, { duration: 5000 });
    } catch {
      this.avisos.open('No se pudo leer el recibo; completa los datos a mano', 'Cerrar', { duration: 6000 });
    } finally {
      this.leyendo.set(false);
    }
  }

  async registrar(facturaId: string): Promise<void> {
    this.enviando.set(true);
    try {
      await this.fachada.registrarPago(facturaId, this.pago);
      this.avisos.open('Pago registrado: se liberó el crédito', undefined, { duration: 5000 });
      this.pago = { ...this.pago, monto: '', referencia: '' };
      await this.fachada.recargar();
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
