/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
/** Edición de un cliente (G7) con las validaciones del alta (spec 001); Viajes publica ClienteActualizado. */
export type ClienteEdicionInput = {
  claveIdempotencia: string | number;
  correo: string;
  nit: string;
  razonSocial: string;
};

export type CoordenadasInput = {
  lat: number;
  lng: number;
};

/** El destino lleva el radio de su geocerca, de 50 a 5000 m (D06). */
export type DestinoInput = {
  coordenadas: CoordenadasInput;
  nombre: string;
  radioMetros: number;
};

export type EstadoAccion = 'APROBADA' | 'ARCHIVADA' | 'EJECUTADA' | 'PENDIENTE' | 'RECHAZADA';

export type EstadoServicio =
  | 'CANCELADO'
  | 'CERRADO'
  | 'CONFIRMADO'
  | 'ENTREGADO'
  | 'ENTREGA_OBSERVADA'
  | 'ENTREGA_RECHAZADA'
  | 'EN_RUTA'
  | 'PROGRAMANDO'
  | 'REQUIERE_INTERVENCION';

export type EstadoUnidad = 'DISPONIBLE' | 'EN_MANTENIMIENTO' | 'EN_VIAJE' | 'INACTIVA' | 'MANTENIMIENTO_PENDIENTE' | 'RESERVADA';

export type EstadoViaje =
  | 'CANCELADO'
  | 'CERRADO'
  | 'CONFIRMADO'
  | 'ENTREGADO'
  | 'ENTREGA_OBSERVADA'
  | 'ENTREGA_RECHAZADA'
  | 'EN_RUTA'
  | 'PROGRAMANDO'
  | 'REQUIERE_INTERVENCION';

export type LugarInput = {
  coordenadas: CoordenadasInput;
  nombre: string;
};

export type OpcionIntervencion = 'MARCAR_RESUELTO' | 'REINTENTAR_COMPENSACION';

/** Alta o edición de una ruta (G4); Viajes publica RutaActualizada. */
export type RutaInput = {
  /** Solo en editarRuta, donde es obligatoria. crearRuta no la lleva: la ruta nace inactiva hasta tener su tarifa (D10). */
  activa?: boolean | null | undefined;
  claveIdempotencia: string | number;
  destino: DestinoInput;
  distanciaKm: number;
  nombre: string;
  origen: LugarInput;
};

export type TipoCarga = 'CONTENEDOR' | 'GRANOS' | 'INSUMOS' | 'INSUMOS_LIQUIDOS';

export type ViajeFilaFragment = {
  viajeId: string;
  servicioId: string;
  estado: EstadoViaje;
  motivo: string | null;
  placa: string | null;
  choferNombre: string | null;
  tipoCarga: TipoCarga;
  toneladas: number;
  fechaViaje: string;
  iniciadoEn: string | null;
  ultimaPosicionEn: string | null;
  ultimaPosicion: { lat: number; lng: number } | null;
  cliente: { clienteId: string; razonSocial: string };
  ruta: { rutaId: string; nombre: string; destino: string; distanciaKm: number };
};

export type ViajesQueryVariables = Exact<{
  estado?: EstadoViaje | null | undefined;
}>;

export type ViajesQuery = {
  viajes: Array<{
    viajeId: string;
    placa: string | null;
    estado: EstadoViaje;
    choferNombre: string | null;
    fechaViaje: string;
    cliente: { razonSocial: string };
    ruta: { nombre: string };
  }> | null;
};

export type MapaQueryVariables = Exact<{
  verRiesgo: boolean;
}>;

export type MapaQuery = {
  viajesEnCurso: Array<{
    viajeId: string;
    placa: string | null;
    ultimaPosicion: { lat: number; lng: number } | null;
    cliente: { razonSocial: string };
    ruta: { nombre: string };
    riesgo?: { probabilidad: number; enRiesgo: boolean } | null;
  }> | null;
};

export type ViajeQueryVariables = Exact<{
  id: string | number;
  verMonto: boolean;
  verRiesgo: boolean;
  verUnidad: boolean;
}>;

export type ViajeQuery = {
  viaje: {
    choferId: string | null;
    monto?: string | null;
    viajeId: string;
    servicioId: string;
    estado: EstadoViaje;
    motivo: string | null;
    placa: string | null;
    choferNombre: string | null;
    tipoCarga: TipoCarga;
    toneladas: number;
    fechaViaje: string;
    iniciadoEn: string | null;
    ultimaPosicionEn: string | null;
    riesgo?: {
      probabilidad: number;
      umbral: number;
      enRiesgo: boolean;
      calculadaEn: string;
      factores: Array<{ nombre: string; aporte: number }>;
    } | null;
    unidad?: { unidadId: string; placa: string; estado: EstadoUnidad } | null;
    hitos: Array<{ hitoId: string; tipo: string; descripcion: string; origen: string | null; registradoEn: string }> | null;
    entrega: {
      entregaId: string;
      tipo: string;
      registradaEn: string;
      distanciaMetros: number | null;
      dentroGeocerca: boolean | null;
      conFirma: boolean | null;
      razones: Array<string> | null;
      nombreReceptor: string | null;
      motivo: string | null;
      decision: string | null;
      decididaPor: string | null;
    } | null;
    ultimaPosicion: { lat: number; lng: number } | null;
    cliente: { clienteId: string; razonSocial: string };
    ruta: { rutaId: string; nombre: string; destino: string; distanciaKm: number };
  } | null;
};

export type EntregasObservadasQueryVariables = Exact<{ [key: string]: never }>;

export type EntregasObservadasQuery = {
  entregasObservadas: Array<{
    viajeId: string;
    servicioId: string;
    estado: EstadoViaje;
    motivo: string | null;
    placa: string | null;
    choferNombre: string | null;
    tipoCarga: TipoCarga;
    toneladas: number;
    fechaViaje: string;
    iniciadoEn: string | null;
    ultimaPosicionEn: string | null;
    entrega: {
      registradaEn: string;
      distanciaMetros: number | null;
      razones: Array<string> | null;
      conFirma: boolean | null;
      nombreReceptor: string | null;
    } | null;
    ultimaPosicion: { lat: number; lng: number } | null;
    cliente: { clienteId: string; razonSocial: string };
    ruta: { rutaId: string; nombre: string; destino: string; distanciaKm: number };
  }> | null;
};

export type IntervencionesQueryVariables = Exact<{ [key: string]: never }>;

export type IntervencionesQuery = {
  intervenciones: Array<{
    viajeId: string;
    servicioId: string;
    estado: EstadoViaje;
    motivo: string | null;
    placa: string | null;
    choferNombre: string | null;
    tipoCarga: TipoCarga;
    toneladas: number;
    fechaViaje: string;
    iniciadoEn: string | null;
    ultimaPosicionEn: string | null;
    ultimaPosicion: { lat: number; lng: number } | null;
    cliente: { clienteId: string; razonSocial: string };
    ruta: { rutaId: string; nombre: string; destino: string; distanciaKm: number };
  }> | null;
};

export type ServiciosQueryVariables = Exact<{
  estado?: EstadoServicio | null | undefined;
  verMonto: boolean;
}>;

export type ServiciosQuery = {
  servicios: Array<{
    servicioId: string;
    clienteId: string;
    razonSocial: string | null;
    estado: EstadoServicio;
    tipoCarga: TipoCarga | null;
    toneladas: number | null;
    fechaViaje: string | null;
    monto?: string | null;
    placa: string | null;
    choferNombre: string | null;
    confirmacionCompleta: boolean;
  }> | null;
};

export type ClientesQueryVariables = Exact<{
  verCredito: boolean;
  despuesDe?: string | null | undefined;
}>;

export type ClientesQuery = {
  clientes: {
    siguienteCursor: string | null;
    items: Array<{
      clienteId: string;
      razonSocial: string;
      nit: string | null;
      correo: string | null;
      canal: string | null;
      lineaCredito?: { limite: string; disponible: string; enMora: boolean; suspendida: boolean } | null;
    }>;
  } | null;
};

export type ClienteQueryVariables = Exact<{
  clienteId: string | number;
  verCredito: boolean;
  verMonto: boolean;
}>;

export type ClienteQuery = {
  cliente: { clienteId: string; razonSocial: string; nit: string | null; correo: string | null; canal: string | null } | null;
  lineaCredito?: { limite: string; reservado: string; utilizado: string; disponible: string; enMora: boolean; suspendida: boolean } | null;
  servicios: Array<{
    servicioId: string;
    viajeId: string | null;
    estado: EstadoServicio;
    rutaId: string | null;
    tipoCarga: TipoCarga | null;
    toneladas: number | null;
    fechaViaje: string | null;
    monto?: string | null;
    placa: string | null;
    creadoEn: string | null;
  }> | null;
  rutas: Array<{ rutaId: string; nombre: string }> | null;
};

export type ClienteFichaFragment = {
  clienteId: string;
  razonSocial: string;
  nit: string | null;
  correo: string | null;
  canal: string | null;
};

export type EditarClienteMutationVariables = Exact<{
  clienteId: string | number;
  input: ClienteEdicionInput;
}>;

export type EditarClienteMutation = {
  editarCliente: { clienteId: string; razonSocial: string; nit: string | null; correo: string | null; canal: string | null };
};

export type RutasQueryVariables = Exact<{ [key: string]: never }>;

export type RutasQuery = {
  rutas: Array<{ rutaId: string; nombre: string; origen: string; destino: string; distanciaKm: number; activa: boolean | null }> | null;
};

export type RutaFichaFragment = {
  rutaId: string;
  nombre: string;
  origen: string;
  destino: string;
  distanciaKm: number;
  activa: boolean | null;
  radioMetros: number | null;
  origenCoordenadas: { lat: number; lng: number } | null;
  destinoCoordenadas: { lat: number; lng: number } | null;
};

export type RutaQueryVariables = Exact<{
  id: string | number;
}>;

export type RutaQuery = {
  ruta: {
    rutaId: string;
    nombre: string;
    origen: string;
    destino: string;
    distanciaKm: number;
    activa: boolean | null;
    radioMetros: number | null;
    origenCoordenadas: { lat: number; lng: number } | null;
    destinoCoordenadas: { lat: number; lng: number } | null;
  } | null;
};

export type CrearRutaMutationVariables = Exact<{
  input: RutaInput;
}>;

export type CrearRutaMutation = {
  crearRuta: {
    rutaId: string;
    nombre: string;
    origen: string;
    destino: string;
    distanciaKm: number;
    activa: boolean | null;
    radioMetros: number | null;
    origenCoordenadas: { lat: number; lng: number } | null;
    destinoCoordenadas: { lat: number; lng: number } | null;
  };
};

export type EditarRutaMutationVariables = Exact<{
  rutaId: string | number;
  input: RutaInput;
}>;

export type EditarRutaMutation = {
  editarRuta: {
    rutaId: string;
    nombre: string;
    origen: string;
    destino: string;
    distanciaKm: number;
    activa: boolean | null;
    radioMetros: number | null;
    origenCoordenadas: { lat: number; lng: number } | null;
    destinoCoordenadas: { lat: number; lng: number } | null;
  };
};

export type AccionesQueryVariables = Exact<{
  estado?: EstadoAccion | null | undefined;
}>;

export type AccionesQuery = {
  accionesPropuestas: Array<{
    accionId: string;
    tipo: string;
    viajeId: string;
    razonSocial: string | null;
    mensaje: string;
    estado: EstadoAccion;
    misionId: string | null;
    creadaEn: string;
    decididaPor: string | null;
    decididaEn: string | null;
    motivoRechazo: string | null;
    evidencia: Array<{ fuente: string; referencia: string; resumen: string }>;
    viaje: { placa: string | null; estado: EstadoViaje; ruta: { nombre: string; destino: string } } | null;
  }> | null;
};

export type AprobarEntregaMutationVariables = Exact<{
  viajeId: string | number;
  nota?: string | null | undefined;
  clave: string | number;
}>;

export type AprobarEntregaMutation = { aprobarEntregaObservada: { viajeId: string; estado: EstadoViaje } };

export type RechazarEntregaMutationVariables = Exact<{
  viajeId: string | number;
  motivo: string;
  clave: string | number;
}>;

export type RechazarEntregaMutation = { rechazarEntregaObservada: { viajeId: string; estado: EstadoViaje } };

export type ResolverIntervencionMutationVariables = Exact<{
  viajeId: string | number;
  opcion: OpcionIntervencion;
  nota?: string | null | undefined;
  clave: string | number;
}>;

export type ResolverIntervencionMutation = { resolverIntervencion: { viajeId: string; estado: EstadoViaje } | null };

export type CancelarServicioMutationVariables = Exact<{
  servicioId: string | number;
  motivo: string;
  clave: string | number;
}>;

export type CancelarServicioMutation = { cancelarServicio: { servicioId: string; estado: EstadoServicio } };

export type AprobarAccionMutationVariables = Exact<{
  id: string | number;
  mensaje: string;
  clave: string | number;
}>;

export type AprobarAccionMutation = { aprobarAccion: { accionId: string; estado: EstadoAccion } };

export type RechazarAccionMutationVariables = Exact<{
  id: string | number;
  motivo?: string | null | undefined;
  clave: string | number;
}>;

export type RechazarAccionMutation = { rechazarAccion: { accionId: string; estado: EstadoAccion } };

export const ViajeFilaFragmentDoc = gql`
  fragment ViajeFila on Viaje {
    viajeId
    servicioId
    estado
    motivo
    placa
    choferNombre
    tipoCarga
    toneladas
    fechaViaje
    iniciadoEn
    ultimaPosicion {
      lat
      lng
    }
    ultimaPosicionEn
    cliente {
      clienteId
      razonSocial
    }
    ruta {
      rutaId
      nombre
      destino
      distanciaKm
    }
  }
`;
export const ClienteFichaFragmentDoc = gql`
  fragment ClienteFicha on Cliente {
    clienteId
    razonSocial
    nit
    correo
    canal
  }
`;
export const RutaFichaFragmentDoc = gql`
  fragment RutaFicha on Ruta {
    rutaId
    nombre
    origen
    destino
    distanciaKm
    activa
    radioMetros
    origenCoordenadas {
      lat
      lng
    }
    destinoCoordenadas {
      lat
      lng
    }
  }
`;
export const ViajesDocument = gql`
  query Viajes($estado: EstadoViaje) {
    viajes(estado: $estado, limite: 80) {
      viajeId
      placa
      estado
      choferNombre
      fechaViaje
      cliente {
        razonSocial
      }
      ruta {
        nombre
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ViajesGQL extends Apollo.Query<ViajesQuery, ViajesQueryVariables> {
  override document = ViajesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const MapaDocument = gql`
  query Mapa($verRiesgo: Boolean!) {
    viajesEnCurso(limite: 50) {
      viajeId
      placa
      ultimaPosicion {
        lat
        lng
      }
      cliente {
        razonSocial
      }
      ruta {
        nombre
      }
      riesgo @include(if: $verRiesgo) {
        probabilidad
        enRiesgo
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class MapaGQL extends Apollo.Query<MapaQuery, MapaQueryVariables> {
  override document = MapaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ViajeDocument = gql`
  query Viaje($id: ID!, $verMonto: Boolean!, $verRiesgo: Boolean!, $verUnidad: Boolean!) {
    viaje(id: $id) {
      ...ViajeFila
      choferId
      monto @include(if: $verMonto)
      riesgo @include(if: $verRiesgo) {
        probabilidad
        umbral
        enRiesgo
        calculadaEn
        factores {
          nombre
          aporte
        }
      }
      unidad @include(if: $verUnidad) {
        unidadId
        placa
        estado
      }
      hitos(limite: 20) {
        hitoId
        tipo
        descripcion
        origen
        registradoEn
      }
      entrega {
        entregaId
        tipo
        registradaEn
        distanciaMetros
        dentroGeocerca
        conFirma
        razones
        nombreReceptor
        motivo
        decision
        decididaPor
      }
    }
  }
  ${ViajeFilaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class ViajeGQL extends Apollo.Query<ViajeQuery, ViajeQueryVariables> {
  override document = ViajeDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const EntregasObservadasDocument = gql`
  query EntregasObservadas {
    entregasObservadas {
      ...ViajeFila
      entrega {
        registradaEn
        distanciaMetros
        razones
        conFirma
        nombreReceptor
      }
    }
  }
  ${ViajeFilaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class EntregasObservadasGQL extends Apollo.Query<EntregasObservadasQuery, EntregasObservadasQueryVariables> {
  override document = EntregasObservadasDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const IntervencionesDocument = gql`
  query Intervenciones {
    intervenciones {
      ...ViajeFila
    }
  }
  ${ViajeFilaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class IntervencionesGQL extends Apollo.Query<IntervencionesQuery, IntervencionesQueryVariables> {
  override document = IntervencionesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ServiciosDocument = gql`
  query Servicios($estado: EstadoServicio, $verMonto: Boolean!) {
    servicios(estado: $estado, limite: 80) {
      servicioId
      clienteId
      razonSocial
      estado
      tipoCarga
      toneladas
      fechaViaje
      monto @include(if: $verMonto)
      placa
      choferNombre
      confirmacionCompleta
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ServiciosGQL extends Apollo.Query<ServiciosQuery, ServiciosQueryVariables> {
  override document = ServiciosDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ClientesDocument = gql`
  query Clientes($verCredito: Boolean!, $despuesDe: Cursor) {
    clientes(limite: 50, despuesDe: $despuesDe) {
      items {
        clienteId
        razonSocial
        nit
        correo
        canal
        lineaCredito @include(if: $verCredito) {
          limite
          disponible
          enMora
          suspendida
        }
      }
      siguienteCursor
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ClientesGQL extends Apollo.Query<ClientesQuery, ClientesQueryVariables> {
  override document = ClientesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ClienteDocument = gql`
  query Cliente($clienteId: ID!, $verCredito: Boolean!, $verMonto: Boolean!) {
    cliente(id: $clienteId) {
      ...ClienteFicha
    }
    lineaCredito(clienteId: $clienteId) @include(if: $verCredito) {
      limite
      reservado
      utilizado
      disponible
      enMora
      suspendida
    }
    servicios(clienteId: $clienteId, limite: 50) {
      servicioId
      viajeId
      estado
      rutaId
      tipoCarga
      toneladas
      fechaViaje
      monto @include(if: $verMonto)
      placa
      creadoEn
    }
    rutas {
      rutaId
      nombre
    }
  }
  ${ClienteFichaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class ClienteGQL extends Apollo.Query<ClienteQuery, ClienteQueryVariables> {
  override document = ClienteDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const EditarClienteDocument = gql`
  mutation EditarCliente($clienteId: ID!, $input: ClienteEdicionInput!) {
    editarCliente(clienteId: $clienteId, input: $input) {
      ...ClienteFicha
    }
  }
  ${ClienteFichaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class EditarClienteGQL extends Apollo.Mutation<EditarClienteMutation, EditarClienteMutationVariables> {
  override document = EditarClienteDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const RutasDocument = gql`
  query Rutas {
    rutas(incluirInactivas: true) {
      rutaId
      nombre
      origen
      destino
      distanciaKm
      activa
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class RutasGQL extends Apollo.Query<RutasQuery, RutasQueryVariables> {
  override document = RutasDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const RutaDocument = gql`
  query Ruta($id: ID!) {
    ruta(id: $id) {
      ...RutaFicha
    }
  }
  ${RutaFichaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class RutaGQL extends Apollo.Query<RutaQuery, RutaQueryVariables> {
  override document = RutaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CrearRutaDocument = gql`
  mutation CrearRuta($input: RutaInput!) {
    crearRuta(input: $input) {
      ...RutaFicha
    }
  }
  ${RutaFichaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class CrearRutaGQL extends Apollo.Mutation<CrearRutaMutation, CrearRutaMutationVariables> {
  override document = CrearRutaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const EditarRutaDocument = gql`
  mutation EditarRuta($rutaId: ID!, $input: RutaInput!) {
    editarRuta(rutaId: $rutaId, input: $input) {
      ...RutaFicha
    }
  }
  ${RutaFichaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class EditarRutaGQL extends Apollo.Mutation<EditarRutaMutation, EditarRutaMutationVariables> {
  override document = EditarRutaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const AccionesDocument = gql`
  query Acciones($estado: EstadoAccion) {
    accionesPropuestas(estado: $estado) {
      accionId
      tipo
      viajeId
      razonSocial
      mensaje
      estado
      misionId
      creadaEn
      decididaPor
      decididaEn
      motivoRechazo
      evidencia {
        fuente
        referencia
        resumen
      }
      viaje {
        placa
        estado
        ruta {
          nombre
          destino
        }
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class AccionesGQL extends Apollo.Query<AccionesQuery, AccionesQueryVariables> {
  override document = AccionesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const AprobarEntregaDocument = gql`
  mutation AprobarEntrega($viajeId: ID!, $nota: String, $clave: ID!) {
    aprobarEntregaObservada(viajeId: $viajeId, nota: $nota, claveIdempotencia: $clave) {
      viajeId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class AprobarEntregaGQL extends Apollo.Mutation<AprobarEntregaMutation, AprobarEntregaMutationVariables> {
  override document = AprobarEntregaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const RechazarEntregaDocument = gql`
  mutation RechazarEntrega($viajeId: ID!, $motivo: String!, $clave: ID!) {
    rechazarEntregaObservada(viajeId: $viajeId, motivo: $motivo, claveIdempotencia: $clave) {
      viajeId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class RechazarEntregaGQL extends Apollo.Mutation<RechazarEntregaMutation, RechazarEntregaMutationVariables> {
  override document = RechazarEntregaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ResolverIntervencionDocument = gql`
  mutation ResolverIntervencion($viajeId: ID!, $opcion: OpcionIntervencion!, $nota: String, $clave: ID!) {
    resolverIntervencion(viajeId: $viajeId, opcion: $opcion, nota: $nota, claveIdempotencia: $clave) {
      viajeId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ResolverIntervencionGQL extends Apollo.Mutation<ResolverIntervencionMutation, ResolverIntervencionMutationVariables> {
  override document = ResolverIntervencionDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CancelarServicioDocument = gql`
  mutation CancelarServicio($servicioId: ID!, $motivo: String!, $clave: ID!) {
    cancelarServicio(servicioId: $servicioId, motivo: $motivo, claveIdempotencia: $clave) {
      servicioId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class CancelarServicioGQL extends Apollo.Mutation<CancelarServicioMutation, CancelarServicioMutationVariables> {
  override document = CancelarServicioDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const AprobarAccionDocument = gql`
  mutation AprobarAccion($id: ID!, $mensaje: String!, $clave: ID!) {
    aprobarAccion(id: $id, mensaje: $mensaje, claveIdempotencia: $clave) {
      accionId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class AprobarAccionGQL extends Apollo.Mutation<AprobarAccionMutation, AprobarAccionMutationVariables> {
  override document = AprobarAccionDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const RechazarAccionDocument = gql`
  mutation RechazarAccion($id: ID!, $motivo: String, $clave: ID!) {
    rechazarAccion(id: $id, motivo: $motivo, claveIdempotencia: $clave) {
      accionId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class RechazarAccionGQL extends Apollo.Mutation<RechazarAccionMutation, RechazarAccionMutationVariables> {
  override document = RechazarAccionDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
