/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
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

export type OpcionIntervencion = 'MARCAR_RESUELTO' | 'REINTENTAR_COMPENSACION';

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

export type MapaQueryVariables = Exact<{ [key: string]: never }>;

export type MapaQuery = {
  viajesEnCurso: Array<{
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
    riesgo: { probabilidad: number; enRiesgo: boolean } | null;
    ultimaPosicion: { lat: number; lng: number } | null;
    cliente: { clienteId: string; razonSocial: string };
    ruta: { rutaId: string; nombre: string; destino: string; distanciaKm: number };
  }> | null;
};

export type ViajeQueryVariables = Exact<{
  id: string | number;
}>;

export type ViajeQuery = {
  viaje: {
    monto: string | null;
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
    riesgo: {
      probabilidad: number;
      umbral: number;
      enRiesgo: boolean;
      calculadaEn: string;
      factores: Array<{ nombre: string; aporte: number }>;
    } | null;
    unidad: { unidadId: string; placa: string; estado: EstadoUnidad } | null;
    hitos: Array<{
      hitoId: string;
      tipo: string;
      descripcion: string;
      origen: string | null;
      registradoEn: string;
    }> | null;
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
}>;

export type ServiciosQuery = {
  servicios: Array<{
    servicioId: string;
    viajeId: string | null;
    clienteId: string;
    estado: EstadoServicio;
    etapa: string | null;
    motivo: string | null;
    tipoCarga: TipoCarga | null;
    toneladas: number | null;
    fechaViaje: string | null;
    monto: string | null;
    placa: string | null;
    choferNombre: string | null;
    confirmacionCompleta: boolean;
    creadoEn: string | null;
  }> | null;
  clientes: Array<{ clienteId: string; razonSocial: string }> | null;
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
    viaje: {
      placa: string | null;
      estado: EstadoViaje;
      ruta: { nombre: string; destino: string };
    } | null;
  }> | null;
};

export type AprobarEntregaMutationVariables = Exact<{
  viajeId: string | number;
  nota?: string | null | undefined;
  clave: string | number;
}>;

export type AprobarEntregaMutation = {
  aprobarEntregaObservada: { viajeId: string; estado: EstadoViaje };
};

export type RechazarEntregaMutationVariables = Exact<{
  viajeId: string | number;
  motivo: string;
  clave: string | number;
}>;

export type RechazarEntregaMutation = {
  rechazarEntregaObservada: { viajeId: string; estado: EstadoViaje };
};

export type ResolverIntervencionMutationVariables = Exact<{
  viajeId: string | number;
  opcion: OpcionIntervencion;
  nota?: string | null | undefined;
  clave: string | number;
}>;

export type ResolverIntervencionMutation = {
  resolverIntervencion: { viajeId: string; estado: EstadoViaje };
};

export type CancelarServicioMutationVariables = Exact<{
  servicioId: string | number;
  motivo: string;
  clave: string | number;
}>;

export type CancelarServicioMutation = {
  cancelarServicio: { servicioId: string; estado: EstadoServicio };
};

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
export const ViajesDocument = gql`
  query Viajes($estado: EstadoViaje) {
    viajes(estado: $estado, limite: 100) {
      ...ViajeFila
    }
  }
  ${ViajeFilaFragmentDoc}
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
  query Mapa {
    viajesEnCurso(limite: 100) {
      ...ViajeFila
      riesgo {
        probabilidad
        enRiesgo
      }
    }
  }
  ${ViajeFilaFragmentDoc}
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
  query Viaje($id: ID!) {
    viaje(id: $id) {
      ...ViajeFila
      monto
      riesgo {
        probabilidad
        umbral
        enRiesgo
        calculadaEn
        factores {
          nombre
          aporte
        }
      }
      unidad {
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
  query Servicios($estado: EstadoServicio) {
    servicios(estado: $estado, limite: 100) {
      servicioId
      viajeId
      clienteId
      estado
      etapa
      motivo
      tipoCarga
      toneladas
      fechaViaje
      monto
      placa
      choferNombre
      confirmacionCompleta
      creadoEn
    }
    clientes {
      clienteId
      razonSocial
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
