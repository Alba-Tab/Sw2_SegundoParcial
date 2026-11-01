import { afterNextRender, Component, inject, Injector, signal, viewChild } from '@angular/core';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { AvisoServicios, controlLista, Encabezado, enfocarTitulo, FiltrosLista, mensajeDe, NumeroPipe, PieLista, Sesion } from 'ui-comun';
import { ROLES_GESTION_RUTAS, textoActiva, textoRuta, type Ruta, type ValoresRuta } from '../domain/ruta';
import { RutasFachada } from '../rutas.fachada';
import { RutaFormulario } from './ruta-formulario';

/** G4: rutas de la empresa (Viajes), activas e inactivas. Gerente y despachador las dan de alta. */
@Component({
  selector: 'app-rutas',
  providers: [RutasFachada],
  imports: [
    Encabezado,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    RouterLink,
    NumeroPipe,
    AvisoServicios,
    FiltrosLista,
    PieLista,
    RutaFormulario,
  ],
  template: `
    <cc-encabezado titulo="Rutas">
      @if (gestiona) {
        <button
          mat-stroked-button
          #botonNueva
          (click)="creando() ? cerrar() : creando.set(true)"
          [attr.aria-expanded]="creando()"
          aria-controls="nueva-ruta"
        >
          Nueva ruta
        </button>
      }
    </cc-encabezado>
    @if (creando()) {
      <app-ruta-formulario
        id="nueva-ruta"
        titulo="Nueva ruta"
        accion="Crear ruta"
        [enviando]="enviando()"
        (guardar)="crear($event)"
        (cancelar)="cerrar()"
      />
    }
    <cc-aviso-servicios [error]="error()" [campos]="campos" [sinDatos]="!rutas().length" />
    <cc-filtros-lista
      [control]="lista"
      [cargando]="cargando()"
      busqueda="Buscar por nombre, origen o destino"
      nombre="rutas"
      singular="ruta"
    />
    <div class="tabla-ancha" role="region" tabindex="0" aria-label="Rutas">
      <table
        mat-table
        [dataSource]="lista.visibles()"
        matSort
        [matSortActive]="lista.orden()"
        [matSortDirection]="lista.dir()"
        (matSortChange)="lista.ordenarPor($event)"
      >
        <ng-container matColumnDef="nombre"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Ruta</th>
          <td mat-cell *matCellDef="let r">
            <a [routerLink]="['/rutas', r.rutaId]">{{ r.nombre }}</a>
          </td></ng-container
        >
        <ng-container matColumnDef="origen"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Origen</th>
          <td mat-cell *matCellDef="let r">{{ r.origen }}</td></ng-container
        >
        <ng-container matColumnDef="destino"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Destino</th>
          <td mat-cell *matCellDef="let r">{{ r.destino }}</td></ng-container
        >
        <ng-container matColumnDef="distancia"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Distancia</th>
          <td mat-cell *matCellDef="let r">{{ r.distanciaKm | numero: 1 }} km</td></ng-container
        >
        <ng-container matColumnDef="activa"
          ><th mat-header-cell *matHeaderCellDef mat-sort-header>Estado</th>
          <td mat-cell *matCellDef="let r" [class.secundario]="r.activa === false">{{ textoActiva(r) }}</td></ng-container
        >
        <tr mat-header-row *matHeaderRowDef="columnas"></tr>
        <tr mat-row *matRowDef="let r; columns: columnas"></tr>
      </table>
    </div>
    <cc-pie-lista [control]="lista" nombre="rutas" vacio="No hay rutas registradas." [error]="error()" [cargando]="cargando()" />
  `,
})
export class RutasPagina {
  private readonly fachada = inject(RutasFachada);
  private readonly avisos = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly botonNueva = viewChild<MatButton>('botonNueva');
  readonly gestiona = inject(Sesion).tiene(...ROLES_GESTION_RUTAS);
  readonly creando = signal(false);
  readonly enviando = signal(false);
  readonly rutas = this.fachada.rutas;
  readonly error = this.fachada.error;
  readonly cargando = this.fachada.cargando;
  readonly campos = { rutas: 'Viajes' };
  readonly columnas = ['nombre', 'origen', 'destino', 'distancia', 'activa'];
  readonly textoActiva = textoActiva;
  readonly lista = controlLista<Ruta>({
    filas: this.rutas,
    texto: textoRuta,
    orden: {
      nombre: (r) => r.nombre,
      origen: (r) => r.origen,
      destino: (r) => r.destino,
      distancia: (r) => r.distanciaKm,
      activa: (r) => textoActiva(r),
    },
    ordenInicial: { orden: 'nombre', dir: 'asc' },
  });

  /** Cierra el formulario y devuelve el foco al botón que lo abrió (o al título). */
  cerrar(): void {
    this.creando.set(false);
    afterNextRender(() => (this.botonNueva() ? this.botonNueva()!.focus() : enfocarTitulo()), { injector: this.injector });
  }

  async crear(valores: ValoresRuta): Promise<void> {
    this.enviando.set(true);
    try {
      const id = await this.fachada.crear(valores);
      this.avisos.open('Ruta creada', undefined, { duration: 4000 });
      this.creando.set(false);
      if (id) await this.router.navigate(['/rutas', id]);
    } catch (e) {
      this.avisos.open(mensajeDe(e), 'Cerrar');
    } finally {
      this.enviando.set(false);
    }
  }
}
