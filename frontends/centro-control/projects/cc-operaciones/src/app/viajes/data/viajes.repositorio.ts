import { inject, Injectable } from '@angular/core';
import {
  AprobarEntregaGQL,
  EntregasObservadasGQL,
  IntervencionesGQL,
  MapaGQL,
  RechazarEntregaGQL,
  ResolverIntervencionGQL,
  ViajeGQL,
  ViajesGQL,
  type EstadoViaje,
  type MapaQueryVariables,
  type OpcionIntervencion,
  type ViajeQueryVariables,
} from '../../graphql/generado';

/** Repositorio sobre Apollo de viajes, mapa, entregas observadas e intervenciones. */
@Injectable({ providedIn: 'root' })
export class ViajesRepositorio {
  private readonly viajesGql = inject(ViajesGQL);
  private readonly viajeGql = inject(ViajeGQL);
  private readonly mapaGql = inject(MapaGQL);
  private readonly entregasGql = inject(EntregasObservadasGQL);
  private readonly intervencionesGql = inject(IntervencionesGQL);
  private readonly aprobarGql = inject(AprobarEntregaGQL);
  private readonly rechazarGql = inject(RechazarEntregaGQL);
  private readonly resolverGql = inject(ResolverIntervencionGQL);

  observarViajes(estado: EstadoViaje | null, cadaMs: number) {
    return this.viajesGql.watch({ variables: { estado }, pollInterval: cadaMs }).valueChanges;
  }

  /** Las variables dicen qué campos con `@roles` (monto, riesgo, unidad) pide el rol. */
  observarViaje(variables: ViajeQueryVariables, cadaMs: number) {
    return this.viajeGql.watch({ variables, pollInterval: cadaMs }).valueChanges;
  }

  recargarViaje(variables: ViajeQueryVariables) {
    return this.viajeGql.fetch({ variables });
  }

  observarMapa(variables: MapaQueryVariables, cadaMs: number) {
    return this.mapaGql.watch({ variables, pollInterval: cadaMs }).valueChanges;
  }

  observarEntregasObservadas(cadaMs: number) {
    return this.entregasGql.watch({ pollInterval: cadaMs }).valueChanges;
  }

  observarIntervenciones(cadaMs: number) {
    return this.intervencionesGql.watch({ pollInterval: cadaMs }).valueChanges;
  }

  aprobarEntrega(viajeId: string, nota: string | undefined, clave: string) {
    return this.aprobarGql.mutate({ variables: { viajeId, nota, clave } });
  }

  rechazarEntrega(viajeId: string, motivo: string, clave: string) {
    return this.rechazarGql.mutate({ variables: { viajeId, motivo, clave } });
  }

  resolverIntervencion(viajeId: string, opcion: OpcionIntervencion, nota: string | undefined, clave: string) {
    return this.resolverGql.mutate({ variables: { viajeId, opcion, nota, clave } });
  }
}
