import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Intentos, puedeVer, Sesion } from 'ui-comun';
import { ServiciosRepositorio } from './data/servicios.repositorio';
import { nombreCliente } from './domain/servicio';

/** Fachada de los servicios confirmados, cada 20 s, y su cancelación. */
@Injectable()
export class ServiciosFachada {
  private readonly repo = inject(ServiciosRepositorio);
  private readonly intentos = new Intentos();
  /** El monto, solo a quien lo puede ver (gerente, administracion, comercial). */
  readonly verMonto = puedeVer(inject(Sesion).roles(), 'monto');
  private readonly datos = toSignal(this.repo.observar('CONFIRMADO', this.verMonto, 20_000));
  readonly servicios = computed(() => this.datos()?.data?.servicios ?? []);
  readonly error = computed(() => this.datos()?.error);

  nombreCliente(clienteId: string): string {
    return nombreCliente(this.datos()?.data?.clientes, clienteId);
  }

  cancelar(servicioId: string, motivo: string) {
    return this.intentos.enviar(`cancelarServicio:${servicioId}`, { motivo }, (clave) => this.repo.cancelar(servicioId, motivo, clave));
  }

  recargar(): Promise<unknown> {
    return firstValueFrom(this.repo.recargar('CONFIRMADO', this.verMonto));
  }
}
