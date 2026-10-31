import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, switchMap } from 'rxjs';
import { AvisoServicios, BobPipe, completo, fechaLaPaz, FechaPipe, Intentos, mensajeDe, Sesion } from 'ui-comun';
import { FacturaGQL, RegistrarPagoGQL, type FacturaQuery, type MedioPago } from '../graphql/generado';
import { leerRecibo } from './ocr';

/**
 * Spec 008: administración registra un pago (baja el saldo y libera crédito). El OCR del recibo (Tesseract.js en el
 * navegador) propone monto, fecha y referencia; la persona los revisa antes de guardar.
 */
@Component({
  selector: 'app-factura',
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
  private readonly gql = inject(FacturaGQL);
  private readonly pagarGql = inject(RegistrarPagoGQL);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  private readonly datos = toSignal(toObservable(this.id).pipe(switchMap((id) => this.gql.watch({ variables: { id } }).valueChanges)));
  readonly factura = computed(() => completo<FacturaQuery>(this.datos())?.factura);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { factura: 'Finanzas' };
  readonly medios: MedioPago[] = ['TRANSFERENCIA', 'DEPOSITO', 'EFECTIVO', 'CHEQUE'];
  readonly enviando = signal(false);
  readonly leyendo = signal(false);
  pago = { monto: '', fecha: fechaLaPaz(), medio: 'TRANSFERENCIA' as MedioPago, referencia: '' };
  /**
   * Una clave por intento (spec 008): si la persona reintenta después de un corte con los mismos datos, Finanzas no
   * registra dos pagos; si corrige el monto después de un error de negocio, la clave es nueva.
   */
  private readonly intentos = new Intentos();

  valido(): boolean {
    return /^(0|[1-9]\d{0,11})\.\d{2}$/.test(this.pago.monto) && this.pago.referencia.trim().length > 0;
  }

  async ocr(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.leyendo.set(true);
    try {
      const leido = await leerRecibo(archivo);
      this.pago = { ...this.pago, ...Object.fromEntries(Object.entries(leido).filter(([, v]) => v)) };
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
      const datos = { facturaId, ...this.pago };
      await this.intentos.enviar(`registrarPago:${facturaId}`, datos, (clave) =>
        this.pagarGql.mutate({ variables: { input: { ...datos, claveIdempotencia: clave } } }),
      );
      this.avisos.open('Pago registrado: se liberó el crédito', undefined, { duration: 5000 });
      this.pago = { ...this.pago, monto: '', referencia: '' };
      await firstValueFrom(this.gql.fetch({ variables: { id: this.id() } }));
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
