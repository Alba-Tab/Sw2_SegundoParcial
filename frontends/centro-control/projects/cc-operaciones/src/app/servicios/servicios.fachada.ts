import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { cargandoDe, conservarUltimoBueno, Intentos, puedeVer, Sesion } from 'ui-comun';
import type { EstadoServicio } from '../graphql/generado';
import { ServiciosRepositorio } from './data/servicios.repositorio';

/** Fachada de los servicios, cada 20 s, filtrados por estado en Viajes (null: todos), y su cancelación. */
@Injectable()
export class ServiciosFachada {
  private readonly repo = inject(ServiciosRepositorio);
  private readonly intentos = new Intentos();
  /** El monto, solo a quien lo puede ver (gerente, administracion, comercial). */
  readonly verMonto = puedeVer(inject(Sesion).roles(), 'monto');
  /** El estado que se pide al servidor; la UI lo fija desde el filtro de la URL. */
  readonly estado = signal<EstadoServicio | null>(null);
  private consulta?: ReturnType<ServiciosRepositorio['observar']>;
  private readonly datos = toSignal(
    toObservable(this.estado).pipe(
      switchMap((e) => (this.consulta = this.repo.observar(e, this.verMonto, 20_000)).valueChanges.pipe(conservarUltimoBueno())),
    ),
  );
  readonly servicios = computed(() => this.datos()?.data?.servicios ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  cancelar(servicioId: string, motivo: string) {
    return this.intentos.enviar(`cancelarServicio:${servicioId}`, { motivo }, (clave) => this.repo.cancelar(servicioId, motivo, clave));
  }

  /** `refetch` del mismo `watch`: al resolver, `servicios()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}
