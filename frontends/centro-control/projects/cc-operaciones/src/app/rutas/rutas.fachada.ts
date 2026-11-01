import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { cargandoDe, completo, esUuid, Intentos } from 'ui-comun';
import type { RutaQuery, RutasQuery } from '../graphql/generado';
import { RutasRepositorio } from './data/rutas.repositorio';
import { aInputRuta, type ValoresRuta } from './domain/ruta';

/** Fachada de la lista de rutas: cambian poco, sin sondeo; el alta la recarga. */
@Injectable()
export class RutasFachada {
  private readonly repo = inject(RutasRepositorio);
  private readonly intentos = new Intentos();
  private readonly consulta = this.repo.observar();
  private readonly datos = toSignal(this.consulta.valueChanges);
  readonly rutas = computed(() => completo<RutasQuery>(this.datos())?.rutas ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  /** Alta (G4): devuelve el id de la ruta creada. */
  async crear(valores: ValoresRuta): Promise<string | undefined> {
    const input = aInputRuta(valores, true);
    const r = await this.intentos.enviar('crearRuta', input, (clave) => this.repo.crear({ ...input, claveIdempotencia: clave }));
    // E10-1: la escritura ya se aplicó; si la relectura falla no es un error del envío (otra clave duplicaría el cambio).
    await this.consulta.refetch().catch(() => undefined);
    return r.data?.crearRuta.rutaId;
  }
}

/** Fachada de la ficha de una ruta (B1: `ruta(id)`) y su edición (G4). */
@Injectable()
export class RutaFachada {
  private readonly repo = inject(RutasRepositorio);
  private readonly intentos = new Intentos();
  readonly id = signal<string | undefined>(undefined);
  readonly idValido = computed(() => esUuid(this.id() ?? ''));
  private consulta?: ReturnType<RutasRepositorio['observarRuta']>;
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id && esUuid(id)),
      switchMap((id) => (this.consulta = this.repo.observarRuta(id)).valueChanges),
    ),
  );
  readonly ruta = computed(() => completo<RutaQuery>(this.datos())?.ruta);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => this.idValido() && cargandoDe(this.datos()));

  async editar(rutaId: string, valores: ValoresRuta): Promise<void> {
    const input = aInputRuta(valores);
    await this.intentos.enviar(`editarRuta:${rutaId}`, input, (clave) => this.repo.editar(rutaId, { ...input, claveIdempotencia: clave }));
    // E10-1: la escritura ya se aplicó; si la relectura falla no es un error del envío (otra clave duplicaría el cambio).
    await this.recargar().catch(() => undefined);
  }

  /** `refetch` del mismo `watch`: al resolver, `ruta()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}
