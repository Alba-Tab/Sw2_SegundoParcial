import { inject, Injectable } from '@angular/core';
import { conservarUltimoBueno } from 'ui-comun';
import {
  CerrarMantenimientoGQL,
  CrearUnidadGQL,
  DarDeBajaUnidadGQL,
  EditarUnidadGQL,
  ProgramarMantenimientoGQL,
  UnidadesGQL,
  UnidadGQL,
  type CierreMantenimientoInput,
  type DarDeBajaUnidadMutationVariables,
  type MantenimientoInput,
  type UnidadEdicionInput,
  type UnidadNuevaInput,
} from '../../graphql/generado';

/** Repositorio sobre Apollo: el único lugar de la feature que conoce los servicios generados (D49). */
@Injectable({ providedIn: 'root' })
export class UnidadesRepositorio {
  private readonly unidadesGql = inject(UnidadesGQL);
  private readonly unidadGql = inject(UnidadGQL);
  private readonly programarGql = inject(ProgramarMantenimientoGQL);
  private readonly cerrarGql = inject(CerrarMantenimientoGQL);
  private readonly crearGql = inject(CrearUnidadGQL);
  private readonly editarGql = inject(EditarUnidadGQL);
  private readonly bajaGql = inject(DarDeBajaUnidadGQL);

  observarUnidades(cadaMs: number) {
    return this.unidadesGql.watch({ pollInterval: cadaMs }).valueChanges.pipe(conservarUltimoBueno());
  }

  /** El `QueryRef`: `recargar` hace `refetch` sobre él, así la señal ya cambió cuando resuelve (V4-1). */
  observarUnidad(id: string) {
    return this.unidadGql.watch({ variables: { id } });
  }

  programarMantenimiento(input: MantenimientoInput) {
    return this.programarGql.mutate({ variables: { input } });
  }

  cerrarMantenimiento(input: CierreMantenimientoInput) {
    return this.cerrarGql.mutate({ variables: { input } });
  }

  crearUnidad(input: UnidadNuevaInput) {
    return this.crearGql.mutate({ variables: { input } });
  }

  editarUnidad(input: UnidadEdicionInput) {
    return this.editarGql.mutate({ variables: { input } });
  }

  darDeBaja(variables: DarDeBajaUnidadMutationVariables) {
    return this.bajaGql.mutate({ variables });
  }
}
