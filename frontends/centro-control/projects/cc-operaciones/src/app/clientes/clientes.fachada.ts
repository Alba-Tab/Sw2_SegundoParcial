import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { cargandoDe, completo, esUuid, filasConError, Intentos, puedeVer, Sesion } from 'ui-comun';
import type { ClienteEdicionInput, ClienteQuery, ClientesQuery } from '../graphql/generado';
import { ClientesRepositorio } from './data/clientes.repositorio';

/** Fachada de la lista de clientes, cada 60 s. */
@Injectable()
export class ClientesFachada {
  readonly verCredito = puedeVer(inject(Sesion).roles(), 'lineaCredito');
  private readonly datos = toSignal(inject(ClientesRepositorio).observarClientes(this.verCredito, 60_000));
  readonly clientes = computed(() => completo<ClientesQuery>(this.datos())?.clientes ?? []);
  readonly error = computed(() => this.datos()?.error);
  readonly datosAl = computed(() => this.datos()?.datosAl);
  readonly cargando = computed(() => cargandoDe(this.datos()));
  /** Clientes cuya línea no se pudo leer (no es lo mismo que no tener línea; D-1). */
  readonly sinLeerCredito = computed(() => {
    const filas = filasConError(this.datos()?.error, 'clientes', 'lineaCredito');
    // Las que se repusieron con la última línea leída (FB-1) ya tienen dato: no se cuentan.
    return new Set([...filas].filter((i) => !this.clientes()[i]?.lineaCredito).map((i) => this.clientes()[i]?.clienteId));
  });
}

/** Fachada de la ficha de un cliente (B1: `cliente(id)`): datos, línea, servicios, rutas para nombrarlos y edición (G7). */
@Injectable()
export class ClienteFachada {
  private readonly repo = inject(ClientesRepositorio);
  private readonly roles = inject(Sesion).roles();
  private readonly intentos = new Intentos();
  readonly verCredito = puedeVer(this.roles, 'lineaCredito');
  readonly verMonto = puedeVer(this.roles, 'monto');
  readonly id = signal<string | undefined>(undefined);
  readonly idValido = computed(() => esUuid(this.id() ?? ''));
  private consulta?: ReturnType<ClientesRepositorio['observarCliente']>;
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id && esUuid(id)),
      switchMap((id) => (this.consulta = this.repo.observarCliente(id, this.verCredito, this.verMonto)).valueChanges),
    ),
  );
  private readonly respuesta = computed(() => completo<ClienteQuery>(this.datos()));
  readonly cliente = computed(() => this.respuesta()?.cliente);
  readonly lineaCredito = computed(() => this.respuesta()?.lineaCredito);
  readonly servicios = computed(() => this.respuesta()?.servicios ?? []);
  readonly rutas = computed(() => this.respuesta()?.rutas);
  readonly error = computed(() => this.datos()?.error);
  readonly cargando = computed(() => this.idValido() && cargandoDe(this.datos()));

  /** G7: la misma clave mientras se reenvían los mismos datos tras un corte (000 §4.1). */
  async editar(clienteId: string, cambio: Omit<ClienteEdicionInput, 'claveIdempotencia'>): Promise<void> {
    const input = { razonSocial: cambio.razonSocial.trim(), nit: cambio.nit.trim(), correo: cambio.correo.trim() };
    await this.intentos.enviar(`editarCliente:${clienteId}`, input, (clave) =>
      this.repo.editar(clienteId, { ...input, claveIdempotencia: clave }),
    );
    await this.recargar();
  }

  /** `refetch` del mismo `watch`: al resolver, `cliente()` ya trae la respuesta nueva (V4-1). */
  recargar(): Promise<unknown> {
    return this.consulta?.refetch() ?? Promise.resolve();
  }
}
