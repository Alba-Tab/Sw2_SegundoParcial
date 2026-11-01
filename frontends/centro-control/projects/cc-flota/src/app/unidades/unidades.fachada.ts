import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { cargandoDe, completo, Intentos } from 'ui-comun';
import type { UnidadesQuery, UnidadQuery } from '../graphql/generado';
import { UnidadesRepositorio } from './data/unidades.repositorio';
import { lineasChecklist, type ItemCierre, type NuevoMantenimiento } from './domain/unidad';

/** Fachada de la lista de unidades: la UI solo lee estas señales. Se provee por componente (el sondeo vive con él). */
@Injectable()
export class UnidadesFachada {
  private readonly datos = toSignal(inject(UnidadesRepositorio).observarUnidades(30_000));
  readonly unidades = computed(() => completo<UnidadesQuery>(this.datos())?.unidades ?? []);
  readonly error = computed(() => this.datos()?.error);
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
  readonly mantenimientos = computed(() => completo<UnidadQuery>(this.datos())?.mantenimientos ?? []);
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

  /** `refetch` del mismo `watch`: al resolver, `unidad()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}
