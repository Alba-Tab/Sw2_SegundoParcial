import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { cargandoDe, completo, esUuid, LIMITE_GATEWAY } from 'ui-comun';
import type { ChoferesQuery, ChoferQuery } from '../graphql/generado';
import { ChoferesRepositorio } from './data/choferes.repositorio';
import { buscarChofer } from './domain/chofer';

/** Fachada de la lista de choferes, cada 60 s. */
@Injectable()
export class ChoferesFachada {
  private readonly datos = toSignal(inject(ChoferesRepositorio).observarChoferes(60_000));
  readonly choferes = computed(() => completo<ChoferesQuery>(this.datos())?.choferes ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}

/** Fachada de la ficha de un chofer: sus datos (de la lista) y su puntaje de conducción de la semana. */
@Injectable()
export class ChoferFachada {
  private readonly repo = inject(ChoferesRepositorio);
  readonly id = signal<string | undefined>(undefined);
  readonly idValido = computed(() => esUuid(this.id() ?? ''));
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id && esUuid(id)),
      switchMap((id) => this.repo.observarChofer(id)),
    ),
  );
  private readonly respuesta = computed(() => completo<ChoferQuery>(this.datos()));
  readonly cargado = computed(() => !!this.respuesta()?.choferes);
  /** La lista llegó al tope: un chofer que no está puede existir más allá (D-3). */
  readonly listaTruncada = computed(() => (this.respuesta()?.choferes?.length ?? 0) >= LIMITE_GATEWAY);
  readonly chofer = computed(() => buscarChofer(this.respuesta()?.choferes, this.id() ?? ''));
  readonly puntajes = computed(() => this.respuesta()?.puntajesConduccion);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => this.idValido() && cargandoDe(this.datos()));
}
