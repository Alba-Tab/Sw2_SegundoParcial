import { afterNextRender, Component, effect, type ElementRef, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  AvisoServicios,
  BobPipe,
  Campo,
  codigoDe,
  CONFIG_CENTRO,
  Encabezado,
  enfocarTitulo,
  Esqueleto,
  Estado,
  estadoLineaCredito,
  EtiquetaPipe,
  FechaPipe,
  largoEntre,
  listoParaEnviar,
  mensajeDe,
  Sesion,
  urlEnApp,
  NumeroPipe,
} from 'ui-comun';
import { ClienteFachada } from '../clientes.fachada';
import { CORREO, mensajeCampoCliente, NIT, nombreRuta, ROLES_EDICION_CLIENTE, type DatosCliente } from '../domain/cliente';

/**
 * Ficha de un cliente (G7, B1): datos por id, línea de crédito y sus últimos servicios con enlace al viaje. Comercial
 * y gerente corrigen razón social, NIT y correo con las reglas del alta (spec 001).
 */
@Component({
  selector: 'app-cliente',
  providers: [ClienteFachada],
  imports: [
    NumeroPipe,
    Esqueleto,
    Encabezado,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    BobPipe,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
    ReactiveFormsModule,
    Campo,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    @let titulo = cliente()?.razonSocial ?? 'Cliente';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Clientes', ruta: '/clientes' }, { texto: titulo }]">
      @if (sesion.tiene('comercial') && cliente(); as c) {
        <a
          mat-button
          [href]="config.urls['portal-cliente'] + '/servicios?clienteId=' + encodeURIComponent(c.clienteId)"
          target="_blank"
          rel="noopener noreferrer"
          ><mat-icon>open_in_new</mat-icon>Ver como cliente <span class="cdk-visually-hidden">(se abre en otra pestaña)</span></a
        >
      }
      @if (edita && cliente(); as c) {
        <button
          mat-stroked-button
          #botonEditar
          (click)="editando() ? cerrar() : abrir(c)"
          [attr.aria-expanded]="editando()"
          aria-controls="editar-cliente"
        >
          Editar datos
        </button>
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios
      buscado="este cliente"
      [error]="error()"
      [campos]="campos"
      [sinDatos]="!cliente()"
      [sinResultado]="!idValido()"
      [reintentar]="recargar"
    />
    @if (cliente(); as c) {
      @if (editando()) {
        <mat-card class="formulario" id="editar-cliente">
          <mat-card-header><mat-card-title>Editar datos del cliente</mat-card-title></mat-card-header>
          <mat-card-content>
            <form [formGroup]="form" (ngSubmit)="guardar(c.clienteId, raiz)" #raiz novalidate>
              <mat-form-field class="ancho">
                <mat-label>Razón social</mat-label>
                <input matInput formControlName="razonSocial" #primerCampo />
                <mat-error>{{ texto('razonSocial') }}</mat-error>
              </mat-form-field>
              <div class="fila-acciones">
                <mat-form-field>
                  <mat-label>NIT</mat-label>
                  <input matInput formControlName="nit" inputmode="numeric" />
                  <mat-error>{{ texto('nit') }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Correo de facturación</mat-label>
                  <input matInput type="email" formControlName="correo" />
                  <mat-hint>A él se envían los avisos</mat-hint>
                  <mat-error>{{ texto('correo') }}</mat-error>
                </mat-form-field>
              </div>
              <div class="fila-acciones">
                <button mat-flat-button type="submit" [disabled]="enviando()" disabledInteractive>Guardar cambios</button>
                <button mat-button type="button" (click)="cerrar()" [disabled]="enviando()">Cancelar</button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      }
      <dl class="datos">
        <div>
          <dt>NIT</dt>
          <dd>{{ c.nit ?? 'Sin dato' }}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>{{ c.correo ?? 'Sin dato' }}</dd>
        </div>
        <div>
          <dt>Canal</dt>
          <dd>{{ c.canal | etiqueta: 'CanalCotizacion' }}</dd>
        </div>
      </dl>

      @if (verCredito) {
        <h2>Línea de crédito</h2>
        @if (linea(); as l) {
          <!-- FL-2: la línea es de Finanzas; aquí se resume y se enlaza a la dueña del dato. -->
          <dl class="datos">
            <div>
              <dt>Estado</dt>
              <dd><cc-estado grupo="EstadoLineaCredito" [valor]="estadoLinea(l)" /></dd>
            </div>
            <div>
              <dt>Disponible</dt>
              <dd>
                {{ l.disponible | bob }} <span class="secundario">de {{ l.limite | bob }}</span>
              </dd>
            </div>
          </dl>
          @if (urlLinea(c); as url) {
            <a mat-button [href]="url"><mat-icon>open_in_new</mat-icon>Ver la línea en Finanzas</a>
          } @else {
            <p class="secundario">El detalle de la línea (reservado y utilizado) lo lleva Finanzas.</p>
          }
        } @else if (!error()) {
          <p class="secundario">El cliente no tiene línea de crédito.</p>
        }
      }

      <h2>Servicios</h2>
      @if (servicios().length) {
        <div class="tabla-ancha" role="region" tabindex="0" aria-label="Servicios del cliente">
          <table mat-table [dataSource]="servicios()">
            <ng-container matColumnDef="fecha"
              ><th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let s">
                @if (s.viajeId) {
                  <a [routerLink]="['/viajes', s.viajeId]">{{ s.fechaViaje | fecha }}</a>
                } @else {
                  {{ s.fechaViaje | fecha }}
                }
              </td></ng-container
            >
            <ng-container matColumnDef="estado"
              ><th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let s"><cc-estado grupo="EstadoServicio" [valor]="s.estado" /></td
            ></ng-container>
            <ng-container matColumnDef="carga"
              ><th mat-header-cell *matHeaderCellDef>Ruta y carga</th>
              <td mat-cell *matCellDef="let s">
                {{ ruta(s.rutaId) }}
                <span class="secundario">{{ s.tipoCarga | etiqueta: 'TipoCarga' }} · {{ s.toneladas | numero }} t</span>
              </td></ng-container
            >
            <ng-container matColumnDef="placa"
              ><th mat-header-cell *matHeaderCellDef>Unidad</th>
              <td mat-cell *matCellDef="let s">{{ s.placa ?? 'Sin dato' }}</td></ng-container
            >
            <ng-container matColumnDef="monto"
              ><th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let s">{{ s.monto | bob }}</td></ng-container
            >
            <tr mat-header-row *matHeaderRowDef="columnas"></tr>
            <tr mat-row *matRowDef="let s; columns: columnas"></tr>
          </table>
        </div>
        @if (servicios().length >= limiteServicios) {
          <p class="secundario">Se muestran los últimos {{ limiteServicios }}.</p>
        }
      } @else if (!error()) {
        <p class="secundario">El cliente aún no tiene servicios.</p>
      }
    }
  `,
  styles: `
    .formulario {
      margin: 16px 0;
    }
    .ancho {
      width: 100%;
    }
  `,
})
export class ClientePagina {
  private readonly fachada = inject(ClienteFachada);
  private readonly avisos = inject(MatSnackBar);
  private readonly injector = inject(Injector);
  private readonly botonEditar = viewChild<MatButton>('botonEditar');
  private readonly primerCampo = viewChild<ElementRef<HTMLInputElement>>('primerCampo');
  readonly sesion = inject(Sesion);
  readonly config = inject(CONFIG_CENTRO);
  readonly id = input.required<string>();
  readonly cliente = this.fachada.cliente;
  readonly linea = this.fachada.lineaCredito;
  readonly servicios = this.fachada.servicios;
  readonly idValido = this.fachada.idValido;
  readonly recargar = () => this.fachada.recargar();
  readonly edita = this.sesion.tiene(...ROLES_EDICION_CLIENTE);
  readonly editando = signal(false);
  readonly enviando = signal(false);
  readonly form = new FormGroup({
    razonSocial: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 120)] }),
    nit: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(NIT)] }),
    correo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CORREO)] }),
  });
  readonly limiteServicios = 50;
  readonly encodeURIComponent = encodeURIComponent;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly verCredito = this.fachada.verCredito;
  readonly campos = {
    cliente: { servicio: 'Viajes', que: 'los datos del cliente' },
    servicios: { servicio: 'Viajes', que: 'los viajes de este cliente' },
    rutas: { servicio: 'Viajes', que: 'los nombres de las rutas' },
    lineaCredito: { servicio: 'Finanzas', que: 'la línea de crédito de este cliente' },
  };
  readonly columnas = ['fecha', 'estado', 'carga', 'placa', ...(this.fachada.verMonto ? ['monto'] : [])];
  readonly estadoLinea = estadoLineaCredito;

  /** La línea en Finanzas, buscada por NIT (o razón social), si el rol abre Finanzas (FL-2). */
  urlLinea(c: { nit?: string | null; razonSocial: string }): string | null {
    const q = encodeURIComponent(c.nit ?? c.razonSocial);
    return urlEnApp(this.config, this.sesion.roles(), 'cc-finanzas', `/lineas-credito?q=${q}`);
  }

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  ruta(rutaId: string | null | undefined): string {
    return nombreRuta(this.fachada.rutas(), rutaId);
  }

  texto(campo: 'razonSocial' | 'nit' | 'correo'): string {
    return mensajeCampoCliente(campo, this.form.controls[campo].errors);
  }

  /** Abre la edición con los datos actuales y el foco en su primer campo: aparece debajo del encabezado (C-7). */
  abrir(c: DatosCliente): void {
    this.form.reset({ razonSocial: c.razonSocial, nit: c.nit ?? '', correo: c.correo ?? '' });
    this.editando.set(true);
    afterNextRender(() => this.primerCampo()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Cierra la edición y devuelve el foco a «Editar datos» (o al título). */
  cerrar(): void {
    this.editando.set(false);
    afterNextRender(() => (this.botonEditar() ? this.botonEditar()!.focus() : enfocarTitulo()), { injector: this.injector });
  }

  async guardar(clienteId: string, raiz: HTMLElement): Promise<void> {
    if (this.enviando() || !listoParaEnviar(this.form, raiz)) return;
    this.enviando.set(true);
    try {
      await this.fachada.editar(clienteId, this.form.getRawValue());
      this.avisos.open('Datos del cliente actualizados', undefined, { duration: 4000 });
      this.cerrar();
    } catch (e) {
      if (codigoDe(e) === 'CONFLICTO_ESTADO') {
        // Spec 001: el NIT es único entre clientes activos; el error va en su campo, con el foco ahí.
        this.form.controls.nit.setErrors({ nitRepetido: true });
        listoParaEnviar(this.form, raiz);
      } else this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
