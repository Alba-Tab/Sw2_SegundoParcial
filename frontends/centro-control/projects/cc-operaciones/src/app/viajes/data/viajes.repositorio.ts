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
  type OpcionIntervencion,
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

  observarViaje(id: string, cadaMs: number) {
    return this.viajeGql.watch({ variables: { id }, pollInterval: cadaMs }).valueChanges;
  }

  recargarViaje(id: string) {
    return this.viajeGql.fetch({ variables: { id } });
  }

  observarMapa(cadaMs: number) {
    return this.mapaGql.watch({ pollInterval: cadaMs }).valueChanges;
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
