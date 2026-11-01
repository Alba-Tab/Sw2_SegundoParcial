import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';
import { completo, puedeVer, Sesion } from 'ui-comun';
import type { ClienteQuery, ClientesQuery } from '../graphql/generado';
import { ClientesRepositorio } from './data/clientes.repositorio';
import { buscarCliente } from './domain/cliente';

/** Fachada de la lista de clientes, cada 60 s. */
@Injectable()
export class ClientesFachada {
  readonly verCredito = puedeVer(inject(Sesion).roles(), 'lineaCredito');
  private readonly datos = toSignal(inject(ClientesRepositorio).observarClientes(this.verCredito, 60_000));
  readonly clientes = computed(() => completo<ClientesQuery>(this.datos())?.clientes ?? []);
  readonly error = computed(() => this.datos()?.error);
}

/** Fachada de la ficha de un cliente: datos, línea de crédito, servicios y la copia de rutas para nombrarlos. */
@Injectable()
export class ClienteFachada {
  private readonly repo = inject(ClientesRepositorio);
  private readonly roles = inject(Sesion).roles();
  readonly verCredito = puedeVer(this.roles, 'lineaCredito');
  readonly verMonto = puedeVer(this.roles, 'monto');
  readonly id = signal<string | undefined>(undefined);
  private readonly datos = toSignal(
    toObservable(this.id).pipe(
      filter((id): id is string => !!id),
      switchMap((id) => this.repo.observarCliente(id, this.verCredito, this.verMonto)),
    ),
  );
  private readonly respuesta = computed(() => completo<ClienteQuery>(this.datos()));
  readonly cargado = computed(() => !!this.respuesta()?.clientes);
  readonly cliente = computed(() => buscarCliente(this.respuesta()?.clientes, this.id() ?? ''));
  readonly lineaCredito = computed(() => this.respuesta()?.lineaCredito);
  readonly servicios = computed(() => this.respuesta()?.servicios ?? []);
  readonly rutas = computed(() => this.respuesta()?.rutas);
  readonly error = computed(() => this.datos()?.error);
}
