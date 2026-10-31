import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, switchMap } from 'rxjs';
import { completo, Intentos } from 'ui-comun';
import type { EstadoViaje, MapaQuery, OpcionIntervencion } from '../graphql/generado';
import { ViajesRepositorio } from './data/viajes.repositorio';

/** Fachadas de la feature de viajes. La UI solo lee sus señales; cada una se provee por componente. */
@Injectable()
export class ViajesFachada {
  private readonly repo = inject(ViajesRepositorio);
  readonly estado = signal<EstadoViaje | null>(null);
  readonly datos = toSignal(toObservable(this.estado).pipe(switchMap((estado) => this.repo.observarViajes(estado, 15_000))));
}

/** El detalle al que llevan las alertas y las decisiones del despachador (specs 007 y 011). */
@Injectable()
export class ViajeFachada {
  private readonly repo = inject(ViajesRepositorio);
  private readonly intentos = new Intentos();
  readonly id = signal<string | undefined>(undefined);
  readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id),
      switchMap((id) => this.repo.observarViaje(id, 20_000)),
    ),
  );

  aprobarEntrega(viajeId: string, nota: string | undefined) {
    return this.intentos.enviar(`aprobarEntrega:${viajeId}`, { nota }, (clave) => this.repo.aprobarEntrega(viajeId, nota, clave));
  }

  rechazarEntrega(viajeId: string, motivo: string) {
    return this.intentos.enviar(`rechazarEntrega:${viajeId}`, { motivo }, (clave) => this.repo.rechazarEntrega(viajeId, motivo, clave));
  }

  resolverIntervencion(viajeId: string, opcion: OpcionIntervencion, nota: string | undefined) {
    return this.intentos.enviar(`resolverIntervencion:${viajeId}`, { opcion, nota }, (clave) =>
      this.repo.resolverIntervencion(viajeId, opcion, nota, clave),
    );
  }

  recargar(): Promise<unknown> {
    const id = this.id();
    return id ? firstValueFrom(this.repo.recargarViaje(id)) : Promise.resolve();
  }
}

/** Mapa en vivo (spec 005): la última posición de cada viaje en ruta, cada 15 s. */
@Injectable()
export class MapaFachada {
  private readonly datos = toSignal(inject(ViajesRepositorio).observarMapa(15_000));
  readonly viajes = computed(() => completo<MapaQuery>(this.datos())?.viajesEnCurso ?? []);
  readonly error = computed(() => this.datos()?.error);
}

@Injectable()
export class EntregasFachada {
  readonly datos = toSignal(inject(ViajesRepositorio).observarEntregasObservadas(15_000));
  readonly error = computed(() => this.datos()?.error);
}

@Injectable()
export class IntervencionesFachada {
  readonly datos = toSignal(inject(ViajesRepositorio).observarIntervenciones(15_000));
  readonly error = computed(() => this.datos()?.error);
}
