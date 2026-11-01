import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { cargandoDe, completo, Intentos } from 'ui-comun';
import type { FacturaQuery, FacturasQuery } from '../graphql/generado';
import { FacturasRepositorio } from './data/facturas.repositorio';
import { leerRecibo } from './data/lector-recibos';
import type { PagoEnEdicion } from './domain/pago';

/** Fachada de la lista de facturas: el filtro "con saldo" es una señal que la UI cambia. */
@Injectable()
export class FacturasFachada {
  private readonly repo = inject(FacturasRepositorio);
  readonly conSaldo = signal<boolean | null>(true);
  private readonly datos = toSignal(toObservable(this.conSaldo).pipe(switchMap((c) => this.repo.observarFacturas(c, 30_000))));
  readonly facturas = computed(() => completo<FacturasQuery>(this.datos())?.facturas ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));
}

/** Fachada del detalle de una factura y del registro de pagos (spec 008). */
@Injectable()
export class FacturaFachada {
  private readonly repo = inject(FacturasRepositorio);
  /**
   * Una clave por intento (spec 008): si la persona reintenta después de un corte con los mismos datos, Finanzas no
   * registra dos pagos; si corrige el monto después de un error de negocio, la clave es nueva.
   */
  private readonly intentos = new Intentos();
  readonly id = signal<string | undefined>(undefined);
  private consulta?: ReturnType<FacturasRepositorio['observarFactura']>;
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id),
      switchMap((id) => (this.consulta = this.repo.observarFactura(id)).valueChanges),
    ),
  );
  readonly factura = computed(() => completo<FacturaQuery>(this.datos())?.factura);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => cargandoDe(this.datos()));

  registrarPago(facturaId: string, pago: PagoEnEdicion) {
    const datos = { facturaId, ...pago };
    return this.intentos.enviar(`registrarPago:${facturaId}`, datos, (clave) =>
      this.repo.registrarPago({ ...datos, claveIdempotencia: clave }),
    );
  }

  leerRecibo(archivo: File) {
    return leerRecibo(archivo);
  }

  /**
   * `refetch` del mismo `watch` (V4-1): al resolver, `factura()` ya trae el saldo y los pagos nuevos. Un `fetch` aparte
   * resolvía antes de que el `watch` emitiera, y el aviso de PAGO_EXCEDE_SALDO decía el saldo viejo.
   */
  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}
