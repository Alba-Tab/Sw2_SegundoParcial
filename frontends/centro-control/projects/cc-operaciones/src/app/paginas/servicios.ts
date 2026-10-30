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
    @if (puedeCancelar()) {
      <div class="fila-acciones">
        <mat-form-field class="ancho"
          ><mat-label>Motivo de la cancelación</mat-label><input matInput [(ngModel)]="motivo"
        /></mat-form-field>
      </div>
    }
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
              <button mat-button (click)="cancelar(s.servicioId)" [disabled]="motivo.trim().length < 3 || enviando()">Cancelar</button>
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
    .ancho {
      min-width: 360px;
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
  motivo = '';

  nombre(clienteId: string): string {
    return this.datos()?.data?.clientes?.find((c) => c?.clienteId === clienteId)?.razonSocial ?? clienteId;
  }

  async cancelar(servicioId: string): Promise<void> {
    this.enviando.set(true);
    try {
      const motivo = this.motivo.trim();
      await this.intentos.enviar(`cancelarServicio:${servicioId}`, { motivo }, (clave) =>
        this.cancelarGql.mutate({ variables: { servicioId, motivo, clave } }),
      );
      this.avisos.open('Servicio cancelado: se devolvieron el crédito y la unidad', undefined, { duration: 5000 });
      this.motivo = '';
      await firstValueFrom(this.gql.fetch({ variables: { estado: 'CONFIRMADO' } }));
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.enviando.set(false);
    }
  }
}
