import { inject, Injectable } from '@angular/core';
import {
  CerrarMantenimientoGQL,
  ProgramarMantenimientoGQL,
  UnidadesGQL,
  UnidadGQL,
  type CierreMantenimientoInput,
  type MantenimientoInput,
} from '../../graphql/generado';

/** Repositorio sobre Apollo: el único lugar de la feature que conoce los servicios generados (D49). */
@Injectable({ providedIn: 'root' })
export class UnidadesRepositorio {
  private readonly unidadesGql = inject(UnidadesGQL);
  private readonly unidadGql = inject(UnidadGQL);
  private readonly programarGql = inject(ProgramarMantenimientoGQL);
  private readonly cerrarGql = inject(CerrarMantenimientoGQL);

  observarUnidades(cadaMs: number) {
    return this.unidadesGql.watch({ pollInterval: cadaMs }).valueChanges;
  }

  observarUnidad(id: string) {
    return this.unidadGql.watch({ variables: { id } }).valueChanges;
  }

  recargarUnidad(id: string) {
    return this.unidadGql.fetch({ variables: { id } });
  }

  programarMantenimiento(input: MantenimientoInput) {
    return this.programarGql.mutate({ variables: { input } });
  }

  cerrarMantenimiento(input: CierreMantenimientoInput) {
    return this.cerrarGql.mutate({ variables: { input } });
  }
}
