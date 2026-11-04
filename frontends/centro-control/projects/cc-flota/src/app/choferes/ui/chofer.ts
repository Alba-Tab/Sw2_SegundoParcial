import { afterNextRender, Component, computed, effect, inject, Injector, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AvisoServicios,
  Campo,
  Confirmacion,
  Encabezado,
  enfocar,
  enfocarTitulo,
  Esqueleto,
  Estado,
  FechaPipe,
  largoEntre,
  listoParaEnviar,
  mensajeDe,
  NumeroPipe,
  Sesion,
  textoError,
  Panel,
} from 'ui-comun';
import { PUNTAJE_BAJO } from '../../conduccion/domain/conduccion';
import { ChoferFachada } from '../choferes.fachada';
import { CATEGORIAS_LICENCIA, estadoChofer, puedeInhabilitar, vigenciaLicencia, type DetalleChofer } from '../domain/chofer';

type PanelAbierto = 'editar' | 'inhabilitar';

/** Ficha de un chofer (G3): licencia, estado y su conducción de la semana (D84); el jefe de flota la edita (D104). */
@Component({
  selector: 'app-chofer',
  providers: [ChoferFachada],
  imports: [
    Panel,
    ReactiveFormsModule,
    Campo,
    Confirmacion,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    Esqueleto,
    Encabezado,
    Estado,
    FechaPipe,
    NumeroPipe,
    AvisoServicios,
  ],
  template: `
    @let titulo = chofer()?.nombre ?? 'Chofer';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Choferes', ruta: '/choferes' }, { texto: titulo }]">
      @if (chofer(); as c) {
        <cc-estado grupo="EstadoChofer" [valor]="estado(c)" />
      }
      @if (chofer(); as c) {
        @if (sesion.tiene('jefe_flota')) {
          <button
            mat-stroked-button
            id="boton-editar"
            (click)="panel() === 'editar' ? cerrarPanel() : abrirEdicion(c)"
            [attr.aria-expanded]="panel() === 'editar'"
            aria-controls="editar"
          >
            <mat-icon>draw</mat-icon>Editar
          </button>
          @if (!c.activo) {
            <!-- Habilitar se deshace inhabilitando: no pide confirmación. -->
            <button mat-stroked-button (click)="habilitar(c.choferId)" [disabled]="enviando()" disabledInteractive>
              <mat-icon>check_circle</mat-icon>Habilitar
            </button>
          } @else if (puedeInhabilitar(c)) {
            <button
              mat-stroked-button
              id="boton-inhabilitar"
              (click)="panel() === 'inhabilitar' ? cerrarPanel() : abrirPanel('inhabilitar')"
              [attr.aria-expanded]="panel() === 'inhabilitar'"
              aria-controls="inhabilitar"
            >
              <mat-icon>person_off</mat-icon>Inhabilitar
            </button>
          }
        }
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios
      buscado="este chofer"
      [error]="error()"
      [campos]="campos"
      [sinDatos]="!chofer()"
      [sinResultado]="!idValido()"
      [reintentar]="recargar"
    />
    @if (chofer(); as c) {
      <dl class="datos">
        <div>
          <dt>Licencia</dt>
          <dd>Categoría {{ c.licenciaCategoria }}</dd>
        </div>
        <div>
          <dt>Licencia vence</dt>
          <dd>{{ c.licenciaVenceEl | fecha }} <cc-estado grupo="Vigencia" [valor]="vigencia()" /></dd>
        </div>
        @if (!c.activo && c.motivoInhabilitacion) {
          <div>
            <dt>Motivo de la inhabilitación</dt>
            <dd>{{ c.motivoInhabilitacion }}</dd>
          </div>
        }
      </dl>
      @if (sesion.tiene('jefe_flota') && c.activo && !c.disponible) {
        <p class="secundario">Tiene un viaje asignado: se puede inhabilitar cuando el viaje termine o se cancele.</p>
      }

      @if (panel() === 'editar' && sesion.tiene('jefe_flota')) {
        <cc-panel class="formulario" id="editar" titulo="Editar chofer">
          <form [formGroup]="edicion" (ngSubmit)="editar(c.choferId, formEditar)" #formEditar novalidate>
            <div class="fila-acciones">
              <mat-form-field>
                <mat-label>Nombre</mat-label>
                <input matInput formControlName="nombre" />
                <mat-error>{{ textoError(edicion.controls.nombre) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Categoría de licencia</mat-label>
                <mat-select formControlName="licenciaCategoria">
                  @for (cat of categorias; track cat) {
                    <mat-option [value]="cat">{{ cat }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Licencia vence</mat-label>
                <input matInput type="date" formControlName="licenciaVenceEl" />
                <mat-error>{{ textoError(edicion.controls.licenciaVenceEl) }}</mat-error>
              </mat-form-field>
            </div>
            <div class="fila-acciones">
              <button mat-flat-button type="submit" [disabled]="enviando()" disabledInteractive>Guardar</button>
              <button mat-button type="button" (click)="cerrarPanel()" [disabled]="enviando()">Cancelar</button>
            </div>
          </form>
        </cc-panel>
      }

      @if (panel() === 'inhabilitar' && sesion.tiene('jefe_flota') && puedeInhabilitar(c)) {
        <cc-panel class="formulario" id="inhabilitar" titulo="Inhabilitar chofer">
          <div #zona>
            <mat-form-field class="ancho">
              <mat-label>Motivo</mat-label>
              <input matInput [formControl]="motivo" />
              <mat-hint>De 3 a 200 caracteres</mat-hint>
              <mat-error>{{ textoError(motivo) }}</mat-error>
            </mat-form-field>
            @if (confirmando()) {
              <cc-confirmacion
                [resumen]="resumenInhabilitar(c.nombre)"
                accion="Sí, inhabilitar"
                icono="person_off"
                [enviando]="enviando()"
                (confirmar)="inhabilitar(c.choferId)"
                (volver)="volverDeConfirmar()"
              />
            } @else {
              <div class="fila-acciones">
                <button mat-flat-button type="button" id="pedir-inhabilitar" (click)="pedirInhabilitar(zona)">Inhabilitar…</button>
                <button mat-button type="button" (click)="cerrarPanel()">Cancelar</button>
              </div>
            }
          </div>
        </cc-panel>
      }

      <cc-panel titulo="Conducción de la semana">
        @if (puntajes(); as p) {
          @if (resumen(); as r) {
            <dl class="datos">
              <div>
                <dt>Puntaje (0 a 100)</dt>
                <dd [class.no-disponible]="r.puntaje < puntajeBajo">
                  @if (r.puntaje < puntajeBajo) {
                    <mat-icon class="icono-en-linea">warning</mat-icon>
                  }
                  {{ r.puntaje | numero: 1 }}
                  @if (r.puntaje < puntajeBajo) {
                    <span class="cdk-visually-hidden">, bajo {{ puntajeBajo }}</span>
                  }
                </dd>
              </div>
              <div>
                <dt>Kilómetros</dt>
                <dd>{{ r.km | numero: 0 }} km</dd>
              </div>
              <div>
                <dt>Frenadas bruscas</dt>
                <dd>{{ r.frenadas }}</dd>
              </div>
              <div>
                <dt>Alertas de fatiga</dt>
                <dd>{{ r.fatigas }}</dd>
              </div>
            </dl>
            <h3>Viajes</h3>
            <ul>
              @for (v of p.viajes; track v.viajeId) {
                <li>
                  Viaje {{ $index + 1 }}: puntaje {{ v.puntaje | numero: 1 }}, {{ v.km | numero: 0 }} km, {{ v.frenadas }}
                  {{ v.frenadas === 1 ? 'frenada brusca' : 'frenadas bruscas' }}
                </li>
              } @empty {
                <li class="secundario">Sin viajes en el periodo.</li>
              }
            </ul>
          } @else {
            <p class="secundario">Sin viajes del {{ p.desde | fecha }} al {{ p.hasta | fecha }}.</p>
          }
        }
      </cc-panel>
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
export class ChoferPagina {
  private readonly fachada = inject(ChoferFachada);
  private readonly avisos = inject(MatSnackBar);
  private readonly injector = inject(Injector);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  readonly chofer = this.fachada.chofer;
  readonly puntajes = this.fachada.puntajes;
  readonly idValido = this.fachada.idValido;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly recargar = () => this.fachada.recargar();
  readonly campos = { chofer: 'Flota', puntajesConduccion: { servicio: 'Analítica', que: 'el puntaje de conducción' } };
  readonly puntajeBajo = PUNTAJE_BAJO;
  readonly estado = estadoChofer;
  readonly puedeInhabilitar = puedeInhabilitar;
  readonly categorias = CATEGORIAS_LICENCIA;
  readonly textoError = textoError;
  readonly vigencia = computed(() => {
    const c = this.chofer();
    return c ? vigenciaLicencia(c) : undefined;
  });
  readonly resumen = computed(() => this.puntajes()?.choferes.find((x) => x.choferId === this.id()));
  readonly panel = signal<PanelAbierto | null>(null);
  readonly enviando = signal(false);
  /** Inhabilitar saca al chofer de las reservas: con el motivo escrito se pide un segundo clic. */
  readonly confirmando = signal(false);
  readonly edicion = new FormGroup({
    // ChoferActualizado (contrato): nombre de 3 a 120 caracteres.
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 120)] }),
    licenciaCategoria: new FormControl<'A' | 'B' | 'C'>('C', { nonNullable: true }),
    licenciaVenceEl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly motivo = new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 200)] });

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
  }

  /** Abre un panel con el foco en su primer campo; abrir otro cierra el anterior. */
  abrirPanel(panel: PanelAbierto): void {
    this.volverDeConfirmar(false);
    this.motivo.reset();
    this.panel.set(panel);
    const primero = `#${panel} input`;
    afterNextRender(() => document.querySelector<HTMLElement>(primero)?.focus(), { injector: this.injector });
  }

  abrirEdicion(c: DetalleChofer): void {
    this.edicion.reset({
      nombre: c.nombre,
      licenciaCategoria: c.licenciaCategoria as 'A' | 'B' | 'C',
      licenciaVenceEl: c.licenciaVenceEl,
    });
    this.abrirPanel('editar');
  }

  /** Cierra el panel y devuelve el foco al botón que lo abrió (o al título, si ya no está). */
  cerrarPanel(): void {
    const boton = `boton-${this.panel()}`;
    this.volverDeConfirmar(false);
    this.panel.set(null);
    afterNextRender(
      () => {
        const el = document.getElementById(boton);
        if (el) el.focus();
        else enfocarTitulo();
      },
      { injector: this.injector },
    );
  }

  async editar(choferId: string, raiz: HTMLElement) {
    if (this.enviando() || !listoParaEnviar(this.edicion, raiz)) return;
    const v = this.edicion.getRawValue();
    if (await this.enviar(() => this.fachada.editar(choferId, { ...v, nombre: v.nombre.trim() }), 'Chofer actualizado')) this.cerrarPanel();
  }

  pedirInhabilitar(raiz: HTMLElement): void {
    if (!listoParaEnviar(this.motivo, raiz)) return;
    this.motivo.disable();
    this.confirmando.set(true);
  }

  volverDeConfirmar(enfocarBoton = true): void {
    this.motivo.enable();
    this.confirmando.set(false);
    if (enfocarBoton) enfocar('pedir-inhabilitar');
  }

  resumenInhabilitar(nombre: string): string {
    return `${nombre} no recibe viajes nuevos hasta que lo habilites. Motivo: «${this.motivo.getRawValue().trim()}».`;
  }

  async inhabilitar(choferId: string) {
    if (
      await this.enviar(() => this.fachada.cambiarHabilitacion(choferId, false, this.motivo.getRawValue().trim()), 'Chofer inhabilitado')
    ) {
      this.volverDeConfirmar(false);
      this.panel.set(null);
      enfocarTitulo();
    } else this.volverDeConfirmar();
  }

  async habilitar(choferId: string) {
    if (this.enviando()) return;
    if (await this.enviar(() => this.fachada.cambiarHabilitacion(choferId, true), 'Chofer habilitado')) enfocarTitulo();
  }

  private async enviar(accion: () => Promise<unknown>, ok: string): Promise<boolean> {
    this.enviando.set(true);
    try {
      await accion();
      this.avisos.open(ok, undefined, { duration: 4000 });
      await this.fachada.recargar();
      return true;
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
      return false;
    } finally {
      this.enviando.set(false);
    }
  }
}
