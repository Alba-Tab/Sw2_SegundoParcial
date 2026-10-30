import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { AvisoServicios, BobPipe, CONFIG_CENTRO, FechaPipe, Intentos, mensajeDe, Sesion } from 'ui-comun';
import { CancelarServicioGQL, ServiciosGQL } from '../graphql/generado';

/**
 * Servicios confirmados (spec 004): el despachador y atención comercial cancelan; comercial abre el portal "como el
 * cliente" por SSO (propuesta 7.7).
 */
@Component({
  selector: 'app-servicios',
  imports: [FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatInputModule, BobPipe, FechaPipe, AvisoServicios],
  template: `
    <h1>Servicios confirmados</h1>
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!servicios().length" />
    <div class="tabla-ancha">
      <table mat-table [dataSource]="servicios()">
        <ng-container matColumnDef="cliente"
          ><th mat-header-cell *matHeaderCellDef>Cliente</th>
          <td mat-cell *matCellDef="let s">{{ nombre(s.clienteId) }}</td></ng-container
        >
        <ng-container matColumnDef="carga"
          ><th mat-header-cell *matHeaderCellDef>Carga</th>
          <td mat-cell *matCellDef="let s">{{ s.tipoCarga }} · {{ s.toneladas }} t</td></ng-container
        >
        <ng-container matColumnDef="fecha"
          ><th mat-header-cell *matHeaderCellDef>Fecha</th>
          <td mat-cell *matCellDef="let s">{{ s.fechaViaje | fecha }}</td></ng-container
        >
        <ng-container matColumnDef="unidad"
          ><th mat-header-cell *matHeaderCellDef>Unidad</th>
          <td mat-cell *matCellDef="let s">{{ s.placa }} · {{ s.choferNombre }}</td></ng-container
        >
        <ng-container matColumnDef="monto"
          ><th mat-header-cell *matHeaderCellDef>Monto</th>
          <td mat-cell *matCellDef="let s">{{ s.monto | bob }}</td></ng-container
        >
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let s">
            @if (puedeCancelar() && s.confirmacionCompleta) {
              @if (confirmando() === s.servicioId) {
                <!-- Cancelar devuelve el crédito y la unidad: se pide el motivo de esta fila y una confirmación. -->
                <div class="confirmacion">
                  <mat-form-field class="motivo"
                    ><mat-label>Motivo (3 a 300)</mat-label
                    ><input matInput [(ngModel)]="motivos[s.servicioId]" minlength="3" maxlength="300" required
                  /></mat-form-field>
                  <button mat-flat-button (click)="cancelar(s.servicioId)" [disabled]="!motivoValido(s.servicioId) || enviando()">
                    Sí, cancelar el servicio
                  </button>
                  <button mat-button (click)="confirmando.set(null)" [disabled]="enviando()">No</button>
                </div>
              } @else {
                <button mat-button (click)="confirmando.set(s.servicioId)" [disabled]="enviando()">Cancelar…</button>
              }
            }
            @if (sesion.tiene('comercial')) {
              <a mat-button [href]="config.urls['portal-cliente'] + '/servicios?clienteId=' + s.clienteId" target="_blank"
                >Ver como cliente</a
              >
            }
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columnas()"></tr>
        <tr mat-row *matRowDef="let s; columns: columnas()"></tr>
      </table>
    </div>
  `,
  styles: `
    .confirmacion {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 4px 0;
    }
    .motivo {
      min-width: 240px;
    }
  `,
})
export class ServiciosPagina {
  private readonly gql = inject(ServiciosGQL);
  private readonly cancelarGql = inject(CancelarServicioGQL);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  readonly datos = toSignal(this.gql.watch({ variables: { estado: 'CONFIRMADO' }, pollInterval: 20_000 }).valueChanges);
  readonly servicios = computed(() => this.datos()?.data?.servicios ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly campos = { servicios: 'Viajes', clientes: 'Viajes' };
  readonly puedeCancelar = computed(() => this.sesion.tiene('despachador', 'comercial'));
  readonly columnas = computed(() =>
    this.sesion.tiene('despachador')
      ? ['cliente', 'carga', 'fecha', 'unidad', 'acciones']
      : ['cliente', 'carga', 'fecha', 'unidad', 'monto', 'acciones'],
  );
  readonly enviando = signal(false);
  private readonly intentos = new Intentos();
  /** La fila que está pidiendo confirmación; cada fila tiene su propio motivo. */
  readonly confirmando = signal<string | null>(null);
  motivos: Record<string, string> = {};

  nombre(clienteId: string): string {
    return this.datos()?.data?.clientes?.find((c) => c?.clienteId === clienteId)?.razonSocial ?? clienteId;
  }

  motivoValido(servicioId: string): boolean {
    const n = (this.motivos[servicioId] ?? '').trim().length;
    return n >= 3 && n <= 300;
  }

  async cancelar(servicioId: string): Promise<void> {
    if (!this.motivoValido(servicioId)) return;
    this.enviando.set(true);
    try {
      const motivo = this.motivos[servicioId].trim();
      await this.intentos.enviar(`cancelarServicio:${servicioId}`, { motivo }, (clave) =>
        this.cancelarGql.mutate({ variables: { servicioId, motivo, clave } }),
      );
      this.avisos.open('Servicio cancelado: se devolvieron el crédito y la unidad', undefined, { duration: 5000 });
      delete this.motivos[servicioId];
      this.confirmando.set(null);
      await firstValueFrom(this.gql.fetch({ variables: { estado: 'CONFIRMADO' } }));
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
