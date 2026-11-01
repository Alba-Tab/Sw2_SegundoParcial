import { afterNextRender, Component, computed, effect, inject, Injector, input, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Encabezado,
  AvisoServicios,
  Campo,
  enfocar,
  enfocarTitulo,
  fechaEntre,
  Estado,
  EtiquetaPipe,
  fechaLaPaz,
  FechaPipe,
  mensajeDe,
  Sesion,
  vigencia,
  Esqueleto,
  Confirmacion,
  etiqueta,
  largoEntre,
  listoParaEnviar,
  textoError,
  NumeroPipe,
} from 'ui-comun';
import {
  AVISO_KM,
  CHECKLIST_POR_DEFECTO,
  checklistCompleto,
  checklistValido,
  cierreInicial,
  claseUnidad,
  documentosEnAviso,
  edicionDesde,
  KM_MANTENIMIENTO,
  motivoBloqueo,
  puedeProgramar,
  venceDocumento,
  type DetalleUnidad,
  type ItemCierre,
  type Mantenimiento,
  type NuevoMantenimiento,
} from '../domain/unidad';
import { UnidadFachada } from '../unidades.fachada';
import { ajustarCampos, CamposUnidad, formularioCampos } from './campos-unidad';

/** El formulario abierto de la ficha: uno a la vez, cada uno con su botón en el encabezado. */
type Panel = 'programar' | 'editar' | 'baja';

/** Spec 010: programar un mantenimiento (la unidad pasa a EN_MANTENIMIENTO) y cerrarlo con su checklist. */
@Component({
  selector: 'app-unidad',
  providers: [UnidadFachada],
  imports: [
    Esqueleto,
    Encabezado,
    ReactiveFormsModule,
    Campo,
    Confirmacion,
    CamposUnidad,
    NumeroPipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    FechaPipe,
    EtiquetaPipe,
    Estado,
    AvisoServicios,
  ],
  template: `
    @let titulo = unidad()?.placa ?? 'Unidad';
    <cc-encabezado [titulo]="titulo" [migas]="[{ texto: 'Unidades', ruta: '/unidades' }, { texto: titulo }]">
      <!-- Un @if por nodo: el encabezado proyecta cc-estado junto al título y lo demás en la zona de acciones. -->
      @if (unidad(); as u) {
        <cc-estado grupo="EstadoUnidad" [valor]="u.estado" />
      }
      @if (unidad(); as u) {
        @if (sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
          <button
            mat-stroked-button
            id="boton-programar"
            (click)="programando() ? cerrarPanel() : abrirFormulario()"
            [attr.aria-expanded]="programando()"
            aria-controls="programar"
          >
            <mat-icon>build</mat-icon>Programar mantenimiento
          </button>
          <!-- D104: editar (capacidad, documentos y atributos) y dar de baja, con la unidad disponible o pendiente. -->
          <button
            mat-stroked-button
            id="boton-editar"
            (click)="panel() === 'editar' ? cerrarPanel() : abrirEdicion(u)"
            [attr.aria-expanded]="panel() === 'editar'"
            aria-controls="editar"
          >
            <mat-icon>draw</mat-icon>Editar
          </button>
          <button
            mat-stroked-button
            id="boton-baja"
            (click)="panel() === 'baja' ? cerrarPanel() : abrirPanel('baja')"
            [attr.aria-expanded]="panel() === 'baja'"
            aria-controls="baja"
          >
            <mat-icon>archive</mat-icon>Dar de baja
          </button>
        }
      }
    </cc-encabezado>
    @if (cargando()) {
      <cc-esqueleto />
    }
    <cc-aviso-servicios buscado="esta unidad" [error]="error()" [campos]="campos" [sinDatos]="!unidad()" [reintentar]="recargar" />
    @if (unidad(); as u) {
      @if (motivoBloqueo(u, sesion.tiene('jefe_flota')); as motivo) {
        <!-- NG-4: lo detenido dice por qué y quién lo resuelve. -->
        <p class="aviso-documentos" role="status">
          <mat-icon>{{ etiquetaEstado(u.estado).icono }}</mat-icon
          >{{ motivo }}
        </p>
      }
      @if (documentosEnAviso(u.documentos); as n) {
        <p class="aviso-documentos" role="status">
          <mat-icon>warning</mat-icon>{{ n === 1 ? 'Un documento vencido o por vencer' : n + ' documentos vencidos o por vencer' }}.
          @if (sesion.tiene('jefe_flota')) {
            Para {{ n === 1 ? 'renovarlo' : 'renovarlos' }}, programa un mantenimiento de tipo «Documentos» o, si ya
            {{ n === 1 ? 'está renovado' : 'están renovados' }}, anota la fecha nueva con «Editar».
          }
        </p>
      }
      <dl class="datos">
        <div>
          <dt>Tipo</dt>
          <dd>{{ u.tipoUnidad | etiqueta: 'TipoUnidad' }} {{ u.tipoRemolque ? (u.tipoRemolque | etiqueta: 'TipoRemolque') : '' }}</dd>
        </div>
        <div>
          <dt>Kilometraje</dt>
          <dd>{{ u.kilometraje !== null && u.kilometraje !== undefined ? (u.kilometraje | numero) + ' km' : 'Sin dato' }}</dd>
        </div>
        <div>
          <dt>Desde el último mantenimiento</dt>
          <dd [class.no-disponible]="u.kmDesdeUltimoMantenimiento >= avisoKm">
            @if (u.kmDesdeUltimoMantenimiento >= avisoKm) {
              <mat-icon class="icono-en-linea">warning</mat-icon>
            }
            {{ u.kmDesdeUltimoMantenimiento | numero }} km
            @if (u.kmDesdeUltimoMantenimiento >= avisoKm) {
              <!-- R2F-11: desde KM_MANTENIMIENTO ya le toca; antes, solo está cerca. -->
              <span class="cdk-visually-hidden">{{
                u.kmDesdeUltimoMantenimiento >= kmMantenimiento ? ', ya le toca el mantenimiento' : ', cerca del mantenimiento'
              }}</span>
            }
          </dd>
        </div>
        @for (d of u.documentos; track d.tipo) {
          <div>
            <dt>{{ d.tipo | etiqueta: 'TipoDocumento' }} vence</dt>
            <dd>{{ d.venceEl | fecha }} <cc-estado grupo="Vigencia" [valor]="vigencia(d.venceEl)" /></dd>
          </div>
        }
      </dl>

      @if (panel() === 'editar' && sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
        <mat-card class="formulario" id="editar">
          <mat-card-header><mat-card-title>Editar unidad</mat-card-title></mat-card-header>
          <mat-card-content>
            <form [formGroup]="edicion" (ngSubmit)="editar(u, formEditar)" #formEditar novalidate>
              <app-campos-unidad [form]="edicion" [clase]="clase()" />
              <div class="fila-acciones">
                <button mat-flat-button type="submit" [disabled]="enviando()" disabledInteractive>Guardar</button>
                <button mat-button type="button" (click)="cerrarPanel()" [disabled]="enviando()">Cancelar</button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      }

      @if (panel() === 'baja' && sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
        <mat-card class="formulario" id="baja">
          <mat-card-header><mat-card-title>Dar de baja</mat-card-title></mat-card-header>
          <mat-card-content #zonaBaja>
            <mat-form-field class="ancho">
              <mat-label>Motivo</mat-label>
              <input matInput [formControl]="motivoBaja" id="motivo-baja" />
              <mat-hint>De 3 a 200 caracteres</mat-hint>
              <mat-error>{{ textoError(motivoBaja) }}</mat-error>
            </mat-form-field>
            @if (confirmandoBaja()) {
              <cc-confirmacion
                [resumen]="resumenBaja(u.placa)"
                accion="Sí, dar de baja"
                icono="archive"
                [enviando]="enviando()"
                (confirmar)="darDeBaja(u.unidadId)"
                (volver)="volverDeBaja()"
              />
            } @else {
              <div class="fila-acciones">
                <button mat-flat-button type="button" id="pedir-baja" (click)="pedirBaja(zonaBaja)">Dar de baja…</button>
                <button mat-button type="button" (click)="cerrarPanel()">Cancelar</button>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }

      @if (programando() && sesion.tiene('jefe_flota') && puedeProgramar(u.estado)) {
        <mat-card class="formulario" id="programar">
          <mat-card-header><mat-card-title>Programar mantenimiento</mat-card-title></mat-card-header>
          <mat-card-content>
            <form [formGroup]="nuevo" (ngSubmit)="programar(u.unidadId, formProgramar)" #formProgramar novalidate>
              <div class="fila-acciones">
                <mat-form-field>
                  <mat-label>Tipo</mat-label>
                  <mat-select formControlName="tipo" #primerCampo>
                    @for (t of tiposMantenimiento; track t) {
                      <mat-option [value]="t">{{ t | etiqueta: 'TipoMantenimiento' }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Fecha</mat-label>
                  <input matInput type="date" formControlName="fechaProgramada" [min]="hoy" />
                  <mat-error>{{ textoError(nuevo.controls.fechaProgramada) }}</mat-error>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Taller</mat-label>
                  <input matInput formControlName="taller" />
                  <mat-error>{{ textoError(nuevo.controls.taller) }}</mat-error>
                </mat-form-field>
              </div>
              <mat-form-field class="ancho">
                <mat-label>Descripción</mat-label>
                <input matInput formControlName="descripcion" />
                <mat-error>{{ textoError(nuevo.controls.descripcion) }}</mat-error>
              </mat-form-field>
              <mat-form-field class="ancho">
                <mat-label>Checklist (una línea por ítem)</mat-label>
                <textarea matInput rows="4" formControlName="checklist"></textarea>
                <mat-error>{{ textoError(nuevo.controls.checklist) }}</mat-error>
              </mat-form-field>
              <div class="fila-acciones">
                <button mat-flat-button type="submit" [disabled]="enviando()" disabledInteractive>Programar</button>
                <button mat-button type="button" (click)="cerrarPanel()" [disabled]="enviando()">Cancelar</button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      }

      <h2>Mantenimientos</h2>
      @for (m of mantenimientos(); track m.mantenimientoId) {
        <mat-card class="mantenimiento">
          <mat-card-header>
            <mat-card-title>{{ m.tipo | etiqueta: 'TipoMantenimiento' }} · {{ m.fechaProgramada | fecha }} · {{ m.taller }}</mat-card-title>
            <mat-card-subtitle><cc-estado grupo="EstadoMantenimiento" [valor]="m.estado" /> {{ m.descripcion }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (m.estado === 'EN_CURSO' && sesion.tiene('jefe_flota') && formsCierre[m.mantenimientoId]; as fc) {
              @for (i of cierres[m.mantenimientoId] ?? []; track i.item) {
                <mat-checkbox [checked]="i.ok" (change)="i.ok = $event.checked" [disabled]="cerrando() === m.mantenimientoId">{{
                  i.item
                }}</mat-checkbox>
              }
              @if (faltanItems() === m.mantenimientoId) {
                <p class="no-disponible" role="alert">
                  Marca todos los ítems; si alguno no se hizo, deja el mantenimiento abierto y anótalo en observaciones.
                </p>
              }
              <div class="fila-acciones" [formGroup]="fc" #zonaCierre>
                @if (u.tipoUnidad === 'TRACTO') {
                  <mat-form-field>
                    <mat-label>Kilometraje</mat-label>
                    <input matInput type="number" min="0" inputmode="numeric" formControlName="kilometraje" />
                    <mat-error>{{ textoError(fc.controls.kilometraje) }}</mat-error>
                  </mat-form-field>
                }
                <mat-form-field class="ancho">
                  <mat-label>Observaciones</mat-label>
                  <input matInput formControlName="observaciones" />
                  <mat-error>{{ textoError(fc.controls.observaciones) }}</mat-error>
                </mat-form-field>
                @if (cerrando() !== m.mantenimientoId) {
                  <button
                    mat-stroked-button
                    [id]="'cerrar-' + m.mantenimientoId"
                    (click)="pedirCierre(m.mantenimientoId, zonaCierre)"
                    [disabled]="enviando()"
                  >
                    <mat-icon>lock</mat-icon>Cerrar mantenimiento
                  </button>
                }
              </div>
              @if (cerrando() === m.mantenimientoId) {
                <cc-confirmacion
                  [resumen]="resumenCierre(m, u.placa)"
                  accion="Sí, cerrar el mantenimiento"
                  icono="lock"
                  [enviando]="enviando()"
                  (confirmar)="cerrar(m.mantenimientoId)"
                  (volver)="volverDelCierre(m.mantenimientoId)"
                />
              }
            } @else {
              @for (i of m.checklist; track i.item) {
                <span class="secundario">{{ i.ok ? '✔' : i.ok === false ? '✘' : '·' }} {{ i.item }} </span>
              }
              @if (m.cerradoEn) {
                <p class="secundario">Cerrado {{ m.cerradoEn | fecha: true }} {{ m.observaciones ?? '' }}</p>
              }
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="secundario">Sin mantenimientos.</p>
      }
      @if (hayMasMantenimientos()) {
        <p class="secundario">Se muestran los 50 mantenimientos más recientes de esta unidad.</p>
      }
    }
  `,
  styles: `
    .aviso-documentos {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--mat-sys-advertencia-container);
      color: var(--mat-sys-on-advertencia-container);
    }
    .formulario,
    .mantenimiento {
      margin: 16px 0;
    }
    .ancho {
      width: 100%;
    }
    mat-checkbox {
      display: block;
    }
  `,
})
export class UnidadPagina {
  private readonly fachada = inject(UnidadFachada);
  private readonly avisos = inject(MatSnackBar);
  readonly sesion = inject(Sesion);
  readonly id = input.required<string>();
  readonly unidad = this.fachada.unidad;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { unidad: 'Flota', mantenimientos: { servicio: 'Flota', que: 'los mantenimientos de esta unidad' } };
  readonly puedeProgramar = puedeProgramar;
  readonly motivoBloqueo = (u: Parameters<typeof motivoBloqueo>[0], jefe: boolean) => motivoBloqueo(u, jefe);
  readonly etiquetaEstado = (estado: string) => etiqueta('EstadoUnidad', estado);
  readonly vigencia = (venceEl: string) => vigencia(venceEl);
  readonly documentosEnAviso = documentosEnAviso;
  readonly avisoKm = AVISO_KM;
  readonly kmMantenimiento = KM_MANTENIMIENTO;
  /** El formulario abierto (programar, editar o dar de baja) se abre desde su acción del encabezado. */
  readonly panel = signal<Panel | null>(null);
  readonly programando = computed(() => this.panel() === 'programar');
  readonly clase = computed(() => {
    const u = this.unidad();
    return u ? claseUnidad(u.tipoUnidad, u.tipoRemolque) : null;
  });
  readonly edicion = formularioCampos();
  readonly motivoBaja = new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 200)] });
  /** La baja no se deshace: con el motivo escrito se pide un segundo clic. */
  readonly confirmandoBaja = signal(false);
  readonly mantenimientos = this.fachada.mantenimientos;
  readonly hayMasMantenimientos = this.fachada.hayMasMantenimientos;
  readonly hoy = fechaLaPaz();
  readonly recargar = () => this.fachada.recargar();
  /** El mantenimiento que se quiso cerrar con ítems sin marcar (spec 010 exige todos hechos). */
  readonly faltanItems = signal<string | null>(null);
  readonly enviando = signal(false);
  /** Cerrar un mantenimiento no se deshace: el que está pidiendo confirmación. */
  readonly cerrando = signal<string | null>(null);
  readonly textoError = textoError;
  readonly tiposMantenimiento = ['PREVENTIVO', 'CORRECTIVO', 'DOCUMENTOS'] as const;
  private readonly primerCampo = viewChild<MatSelect>('primerCampo');
  private readonly injector = inject(Injector);
  readonly nuevo = new FormGroup({
    tipo: new FormControl<NuevoMantenimiento['tipo']>('PREVENTIVO', { nonNullable: true }),
    // Spec 010: hoy o después.
    fechaProgramada: new FormControl(fechaLaPaz(), { nonNullable: true, validators: [Validators.required, fechaEntre(fechaLaPaz)] }),
    taller: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(3, 120)] }),
    descripcion: new FormControl('', { nonNullable: true, validators: [Validators.required, largoEntre(1, 1000)] }),
    checklist: new FormControl(CHECKLIST_POR_DEFECTO, {
      nonNullable: true,
      validators: [(c) => (checklistValido(c.value) ? null : { lineas: true })],
    }),
  });
  cierres: Record<string, ItemCierre[]> = {};
  formsCierre: Record<string, ReturnType<typeof formularioCierre>> = {};

  constructor() {
    effect(() => this.fachada.id.set(this.id()));
    // Los formularios de cierre se crean cuando se sabe si la unidad es tracto (kilometraje obligatorio), no antes (E-20).
    effect(() => {
      const unidad = this.unidad();
      if (!unidad) return;
      for (const m of this.mantenimientos()) {
        this.cierres[m.mantenimientoId] ??= cierreInicial(m);
        this.formsCierre[m.mantenimientoId] ??= formularioCierre(unidad.tipoUnidad === 'TRACTO');
      }
    });
  }

  /** Abre el formulario de programar con el foco en su primer campo: aparece debajo de los datos, fuera de la vista en móvil (C-7). */
  abrirFormulario(): void {
    this.volverDeBaja(false);
    this.panel.set('programar');
    afterNextRender(() => this.primerCampo()?.focus(), { injector: this.injector });
  }

  /** Abre el panel de editar o de dar de baja con el foco en su primer campo; abrir otro cierra el anterior. */
  abrirPanel(panel: Panel): void {
    this.volverDeBaja(false);
    this.motivoBaja.reset();
    this.panel.set(panel);
    const primero = `#${panel} input, #${panel} mat-select`;
    afterNextRender(() => document.querySelector<HTMLElement>(primero)?.focus(), { injector: this.injector });
  }

  /** La edición empieza con lo que la unidad tiene hoy. */
  abrirEdicion(u: DetalleUnidad): void {
    this.edicion.reset();
    this.edicion.patchValue({
      capacidadToneladas: u.capacidadToneladas ?? null,
      soat: venceDocumento(u.documentos, 'SOAT'),
      inspeccion: venceDocumento(u.documentos, 'INSPECCION_TECNICA'),
      atributos: (u.atributos ?? {}) as Record<string, number>,
    });
    ajustarCampos(this.edicion, this.clase());
    this.abrirPanel('editar');
  }

  /** Cierra el panel abierto y devuelve el foco al botón que lo abrió (o al título, si ya no está). */
  cerrarPanel(): void {
    const boton = `boton-${this.panel()}`;
    this.volverDeBaja(false);
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

  async editar(u: DetalleUnidad, raiz: HTMLElement) {
    const clase = this.clase();
    if (this.enviando() || !clase || !listoParaEnviar(this.edicion, raiz)) return;
    const edicion = edicionDesde(clase, this.edicion.getRawValue());
    if (await this.enviar(() => this.fachada.editar(u.unidadId, edicion), 'Unidad actualizada')) this.cerrarPanel();
  }

  /** Con el motivo válido, lo bloquea y pide confirmar (E-4, E-6). */
  pedirBaja(raiz: HTMLElement): void {
    if (!listoParaEnviar(this.motivoBaja, raiz)) return;
    this.motivoBaja.disable();
    this.confirmandoBaja.set(true);
  }

  /** "No, volver" o una baja fallida: desbloquea el motivo y el foco vuelve a "Dar de baja…". */
  volverDeBaja(enfocarBoton = true): void {
    this.motivoBaja.enable();
    this.confirmandoBaja.set(false);
    if (enfocarBoton) enfocar('pedir-baja');
  }

  resumenBaja(placa: string): string {
    return `${placa} queda inactiva y no vuelve a operar. Motivo: «${this.motivoBaja.getRawValue().trim()}». No se puede deshacer.`;
  }

  async darDeBaja(unidadId: string) {
    if (await this.enviar(() => this.fachada.darDeBaja(unidadId, this.motivoBaja.getRawValue().trim()), 'Unidad dada de baja')) {
      this.volverDeBaja(false);
      this.panel.set(null);
      // La unidad queda INACTIVA y sin acciones: el foco va al título.
      enfocarTitulo();
    } else this.volverDeBaja();
  }

  async programar(unidadId: string, raiz: HTMLElement) {
    // disabledInteractive: «Programar» sigue enfocable mientras se envía; otro envío no hace nada.
    if (this.enviando() || !listoParaEnviar(this.nuevo, raiz)) return;
    const v = this.nuevo.getRawValue();
    const nuevo = { ...v, taller: v.taller.trim(), descripcion: v.descripcion.trim() };
    if (await this.enviar(() => this.fachada.programar(unidadId, nuevo), 'Mantenimiento programado')) {
      this.nuevo.reset();
      this.cerrarPanel();
    }
  }

  /** Pide confirmar con todos los ítems marcados y el formulario bloqueado (E-4, E-6). */
  pedirCierre(mantenimientoId: string, raiz: HTMLElement): void {
    const form = this.formsCierre[mantenimientoId];
    const completo = checklistCompleto(this.cierres[mantenimientoId] ?? []);
    this.faltanItems.set(completo ? null : mantenimientoId);
    if (!listoParaEnviar(form, raiz) || !completo) return;
    form.disable();
    this.cerrando.set(mantenimientoId);
  }

  /** "No, volver" o un cierre fallido: desbloquea y el foco vuelve a "Cerrar mantenimiento" (E-3). */
  volverDelCierre(mantenimientoId: string): void {
    this.formsCierre[mantenimientoId]?.enable();
    this.cerrando.set(null);
    enfocar(`cerrar-${mantenimientoId}`);
  }

  resumenCierre(m: Mantenimiento, placa: string): string {
    const items = this.cierres[m.mantenimientoId] ?? [];
    const km = this.formsCierre[m.mantenimientoId]?.controls.kilometraje.value;
    return (
      `Se cierra el mantenimiento ${etiqueta('TipoMantenimiento', m.tipo).texto.toLowerCase()} de ${placa} con ` +
      `los ${items.length} ítems hechos${km !== null && km !== undefined ? ` y ${km} km` : ''}. ` +
      'No se puede deshacer.'
    );
  }

  async cerrar(mantenimientoId: string) {
    const v = this.formsCierre[mantenimientoId].getRawValue();
    const cierre = {
      kilometraje: v.kilometraje ?? undefined,
      checklist: this.cierres[mantenimientoId],
      observaciones: v.observaciones.trim() || undefined,
    };
    if (await this.enviar(() => this.fachada.cerrar(mantenimientoId, cierre), 'Mantenimiento cerrado')) {
      this.cerrando.set(null);
      // El mantenimiento queda cerrado y su botón desaparece: el foco va al título de la unidad.
      enfocarTitulo();
    } else this.volverDelCierre(mantenimientoId);
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

/** Cierre de un mantenimiento: el kilometraje es obligatorio en tractos y prohibido en remolques (contrato de Flota). */
function formularioCierre(tracto: boolean) {
  return new FormGroup({
    kilometraje: new FormControl<number | null>(null, tracto ? [Validators.required, Validators.min(0)] : []),
    observaciones: new FormControl('', { nonNullable: true, validators: [largoEntre(0, 1000)] }),
  });
}
