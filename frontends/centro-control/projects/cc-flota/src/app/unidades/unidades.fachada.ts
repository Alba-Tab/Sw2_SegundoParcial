import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { cargandoDe, completo, Intentos } from 'ui-comun';
import type { UnidadesQuery, UnidadQuery } from '../graphql/generado';
import { UnidadesRepositorio } from './data/unidades.repositorio';
import { lineasChecklist, type EdicionUnidad, type ItemCierre, type NuevaUnidad, type NuevoMantenimiento } from './domain/unidad';

/** Fachada de la lista de unidades: la UI solo lee estas señales. Se provee por componente (el sondeo vive con él). */
@Injectable()
export class UnidadesFachada {
  private readonly datos = toSignal(inject(UnidadesRepositorio).observarUnidades(30_000));
  readonly unidades = computed(() => completo<UnidadesQuery>(this.datos())?.unidades ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}

/** Fachada del detalle de una unidad y sus mantenimientos (spec 010). */
@Injectable()
export class UnidadFachada {
  private readonly repo = inject(UnidadesRepositorio);
  private readonly intentos = new Intentos();
  /** La unidad que se mira; la UI la fija desde la ruta. */
  readonly id = signal<string | undefined>(undefined);
  private consulta?: ReturnType<UnidadesRepositorio['observarUnidad']>;
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id),
      switchMap((id) => (this.consulta = this.repo.observarUnidad(id)).valueChanges),
    ),
  );
  readonly unidad = computed(() => completo<UnidadQuery>(this.datos())?.unidad);
  readonly mantenimientos = computed(() => completo<UnidadQuery>(this.datos())?.mantenimientos?.items ?? []);
  /** La unidad tiene más de los 100 mantenimientos que trae la ficha. */
  readonly hayMasMantenimientos = computed(() => !!completo<UnidadQuery>(this.datos())?.mantenimientos?.siguienteCursor);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  programar(unidadId: string, nuevo: NuevoMantenimiento) {
    const input = { unidadId, ...nuevo, checklist: lineasChecklist(nuevo.checklist) };
    return this.intentos.enviar(`programarMantenimiento:${unidadId}`, input, (clave) =>
      this.repo.programarMantenimiento({ ...input, claveIdempotencia: clave }),
    );
  }

  cerrar(mantenimientoId: string, cierre: { kilometraje?: number; checklist: ItemCierre[]; observaciones?: string }) {
    const input = { mantenimientoId, ...cierre };
    return this.intentos.enviar(`cerrarMantenimiento:${mantenimientoId}`, input, (clave) =>
      this.repo.cerrarMantenimiento({ ...input, claveIdempotencia: clave }),
    );
  }

  editar(unidadId: string, edicion: EdicionUnidad) {
    const input = { unidadId, ...edicion };
    return this.intentos.enviar(`editarUnidad:${unidadId}`, input, (clave) =>
      this.repo.editarUnidad({ ...input, claveIdempotencia: clave }),
    );
  }

  darDeBaja(unidadId: string, motivo: string) {
    return this.intentos.enviar(`darDeBajaUnidad:${unidadId}`, { unidadId, motivo }, (clave) =>
      this.repo.darDeBaja({ unidadId, motivo, claveIdempotencia: clave }),
    );
  }

  /** `refetch` del mismo `watch`: al resolver, `unidad()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}

/** Fachada del alta de una unidad (spec 010, D104): sin sondeo; devuelve el id de la unidad creada. */
@Injectable()
export class AltaUnidadFachada {
  private readonly repo = inject(UnidadesRepositorio);
  private readonly intentos = new Intentos();

  async crear(nueva: NuevaUnidad): Promise<string | undefined> {
    const r = await this.intentos.enviar('crearUnidad', nueva, (clave) => this.repo.crearUnidad({ ...nueva, claveIdempotencia: clave }));
    return r.data?.crearUnidad.unidadId;
  }
}
