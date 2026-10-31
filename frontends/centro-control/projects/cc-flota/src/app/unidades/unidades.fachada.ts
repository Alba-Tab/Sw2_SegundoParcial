import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, switchMap } from 'rxjs';
import { completo, Intentos } from 'ui-comun';
import type { UnidadesQuery, UnidadQuery } from '../graphql/generado';
import { UnidadesRepositorio } from './data/unidades.repositorio';
import { lineasChecklist, type ItemCierre, type NuevoMantenimiento } from './domain/unidad';

/** Fachada de la lista de unidades: la UI solo lee estas señales. Se provee por componente (el sondeo vive con él). */
@Injectable()
export class UnidadesFachada {
  private readonly datos = toSignal(inject(UnidadesRepositorio).observarUnidades(30_000));
  readonly unidades = computed(() => completo<UnidadesQuery>(this.datos())?.unidades ?? []);
  readonly error = computed(() => this.datos()?.error);
}

/** Fachada del detalle de una unidad y sus mantenimientos (spec 010). */
@Injectable()
export class UnidadFachada {
  private readonly repo = inject(UnidadesRepositorio);
  private readonly intentos = new Intentos();
  /** La unidad que se mira; la UI la fija desde la ruta. */
  readonly id = signal<string | undefined>(undefined);
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id),
      switchMap((id) => this.repo.observarUnidad(id)),
    ),
  );
  readonly unidad = computed(() => completo<UnidadQuery>(this.datos())?.unidad);
  readonly mantenimientos = computed(() => completo<UnidadQuery>(this.datos())?.mantenimientos ?? []);
  readonly error = computed(() => this.datos()?.error);

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

  recargar(): Promise<unknown> {
    const id = this.id();
    return id ? firstValueFrom(this.repo.recargarUnidad(id)) : Promise.resolve();
  }
}
