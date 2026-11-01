import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, switchMap } from 'rxjs';
import { cargandoDe, completo, esUuid, Intentos, PaginasCursor } from 'ui-comun';
import type { ChoferesQuery, ChoferQuery } from '../graphql/generado';
import { ChoferesRepositorio } from './data/choferes.repositorio';
import type { EdicionChofer } from './domain/chofer';

/** Fachada de la lista de choferes: la primera página cada 60 s y las demás con «Cargar más». */
@Injectable()
export class ChoferesFachada {
  private readonly repo = inject(ChoferesRepositorio);
  private readonly datos = toSignal(this.repo.observarChoferes(60_000));
  readonly paginas = new PaginasCursor(
    () => completo<ChoferesQuery>(this.datos())?.choferes,
    async (despuesDe) => {
      const r = await firstValueFrom(this.repo.pagina(despuesDe));
      return { pagina: completo<ChoferesQuery>(r)?.choferes, error: r.error };
    },
    (c) => c.choferId,
  );
  readonly choferes = this.paginas.items;
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}

/** Fachada de la ficha de un chofer: sus datos, su puntaje de conducción de la semana, la edición y la habilitación. */
@Injectable()
export class ChoferFachada {
  private readonly repo = inject(ChoferesRepositorio);
  private readonly intentos = new Intentos();
  readonly id = signal<string | undefined>(undefined);
  readonly idValido = computed(() => esUuid(this.id() ?? ''));
  private consulta?: ReturnType<ChoferesRepositorio['observarChofer']>;
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id && esUuid(id)),
      switchMap((id) => (this.consulta = this.repo.observarChofer(id)).valueChanges),
    ),
  );
  private readonly respuesta = computed(() => completo<ChoferQuery>(this.datos()));
  readonly chofer = computed(() => this.respuesta()?.chofer ?? undefined);
  readonly puntajes = computed(() => this.respuesta()?.puntajesConduccion);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => this.idValido() && cargandoDe(this.datos()));

  editar(choferId: string, edicion: EdicionChofer) {
    const input = { choferId, ...edicion };
    return this.intentos.enviar(`editarChofer:${choferId}`, input, (clave) => this.repo.editar({ ...input, claveIdempotencia: clave }));
  }

  /** Habilitar o inhabilitar; el motivo solo viaja al inhabilitar (Flota lo exige). */
  cambiarHabilitacion(choferId: string, activo: boolean, motivo?: string) {
    const datos = { choferId, activo, ...(activo ? {} : { motivo }) };
    return this.intentos.enviar(`cambiarHabilitacionChofer:${choferId}`, datos, (clave) =>
      this.repo.cambiarHabilitacion({ ...datos, claveIdempotencia: clave }),
    );
  }

  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}
