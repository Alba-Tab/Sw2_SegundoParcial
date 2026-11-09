/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
export type EstadoAlerta = 'ABIERTA' | 'ATENDIDA' | 'RESUELTA';

export type Rol = 'administracion' | 'comercial' | 'despachador' | 'gerente' | 'jefe_flota';

export type TipoAlerta =
  | 'ACCION_PROPUESTA'
  | 'ANOMALIA_COMBUSTIBLE'
  | 'CAIDA_COMBUSTIBLE'
  | 'ENTREGA_OBSERVADA'
  | 'ENTREGA_RECHAZADA'
  | 'MANTENIMIENTO_REQUERIDO'
  | 'RIESGO_RETRASO'
  | 'VIAJE_REQUIERE_INTERVENCION';

export type AlertaCamposFragment = {
  alertaId: string;
  secuencia: number;
  tipo: TipoAlerta;
  severidad: string;
  titulo: string;
  detalle: string;
  enlace: string;
  estado: EstadoAlerta;
  creadaEn: string;
  origen: string;
  entidad: { tipo: string; id: string };
};

export type AlertasPendientesQueryVariables = Exact<{
  desde?: string | null | undefined;
}>;

export type AlertasPendientesQuery = {
  alertasPendientes: {
    siguienteCursor: string | null;
    abiertas: number;
    datosAl: string | null;
    alertas: Array<{
      alertaId: string;
      secuencia: number;
      tipo: TipoAlerta;
      severidad: string;
      titulo: string;
      detalle: string;
      enlace: string;
      estado: EstadoAlerta;
      creadaEn: string;
      origen: string;
      entidad: { tipo: string; id: string };
    }>;
  } | null;
};

export type AlertasNuevasSubscriptionVariables = Exact<{ [key: string]: never }>;

export type AlertasNuevasSubscription = {
  alertas: {
    alertaId: string;
    secuencia: number;
    tipo: TipoAlerta;
    severidad: string;
    titulo: string;
    detalle: string;
    enlace: string;
    estado: EstadoAlerta;
    creadaEn: string;
    origen: string;
    entidad: { tipo: string; id: string };
  };
};

export type AtenderAlertaMutationVariables = Exact<{
  alertaId: string | number;
  nota?: string | null | undefined;
  clave: string | number;
}>;

export type AtenderAlertaMutation = { atenderAlerta: { alertaId: string; estado: EstadoAlerta } };

export type YoQueryVariables = Exact<{ [key: string]: never }>;

export type YoQuery = { yo: { sub: string; nombre: string | null; roles: Array<Rol> } };

export const AlertaCamposFragmentDoc = gql`
  fragment AlertaCampos on Alerta {
    alertaId
    secuencia
    tipo
    severidad
    titulo
    detalle
    entidad {
      tipo
      id
    }
    enlace
    estado
    creadaEn
    origen
  }
`;
export const AlertasPendientesDocument = gql`
  query AlertasPendientes($desde: Cursor) {
    alertasPendientes(desde: $desde, limite: 50) {
      alertas {
        ...AlertaCampos
      }
      siguienteCursor
      abiertas
      datosAl
    }
  }
  ${AlertaCamposFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class AlertasPendientesGQL extends Apollo.Query<AlertasPendientesQuery, AlertasPendientesQueryVariables> {
  override document = AlertasPendientesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const AlertasNuevasDocument = gql`
  subscription AlertasNuevas {
    alertas {
      ...AlertaCampos
    }
  }
  ${AlertaCamposFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class AlertasNuevasGQL extends Apollo.Subscription<AlertasNuevasSubscription, AlertasNuevasSubscriptionVariables> {
  override document = AlertasNuevasDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const AtenderAlertaDocument = gql`
  mutation AtenderAlerta($alertaId: ID!, $nota: String, $clave: ID!) {
    atenderAlerta(alertaId: $alertaId, nota: $nota, claveIdempotencia: $clave) {
      alertaId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class AtenderAlertaGQL extends Apollo.Mutation<AtenderAlertaMutation, AtenderAlertaMutationVariables> {
  override document = AtenderAlertaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const YoDocument = gql`
  query Yo {
    yo {
      sub
      nombre
      roles
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class YoGQL extends Apollo.Query<YoQuery, YoQueryVariables> {
  override document = YoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
