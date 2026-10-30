/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
export type CierreMantenimientoInput = {
  checklist: Array<ItemChecklistInput>;
  claveIdempotencia: string | number;
  documentosRenovados?: Array<DocumentoInput> | null | undefined;
  kilometraje?: number | null | undefined;
  mantenimientoId: string | number;
  observaciones?: string | null | undefined;
};

export type DocumentoInput = {
  tipo: string;
  venceEl: string;
};

export type EstadoUnidad = 'DISPONIBLE' | 'EN_MANTENIMIENTO' | 'EN_VIAJE' | 'INACTIVA' | 'MANTENIMIENTO_PENDIENTE' | 'RESERVADA';

export type ItemChecklistInput = {
  item: string;
  nota?: string | null | undefined;
  ok: boolean;
};

export type MantenimientoInput = {
  checklist: Array<string>;
  claveIdempotencia: string | number;
  descripcion: string;
  fechaProgramada: string;
  taller: string;
  tipo: TipoMantenimiento;
  unidadId: string | number;
};

export type TipoMantenimiento = 'CORRECTIVO' | 'DOCUMENTOS' | 'PREVENTIVO';

export type TipoUnidad = 'REMOLQUE' | 'TRACTO';

export type UnidadesQueryVariables = Exact<{
  tipo?: TipoUnidad | null | undefined;
  estado?: EstadoUnidad | null | undefined;
}>;

export type UnidadesQuery = {
  unidades: Array<{
    unidadId: string;
    tipoUnidad: TipoUnidad;
    placa: string;
    tipoRemolque: string | null;
    estado: EstadoUnidad;
    kilometraje: number | null;
    kmDesdeUltimoMantenimiento: number;
    documentos: Array<{ tipo: string; venceEl: string }>;
  }> | null;
};

export type UnidadQueryVariables = Exact<{
  id: string | number;
}>;

export type UnidadQuery = {
  unidad: {
    unidadId: string;
    tipoUnidad: TipoUnidad;
    placa: string;
    tipoRemolque: string | null;
    capacidadToneladas: number | null;
    estado: EstadoUnidad;
    kilometraje: number | null;
    kmDesdeUltimoMantenimiento: number;
    atributos: any;
    documentos: Array<{ tipo: string; venceEl: string }>;
  } | null;
  mantenimientos: Array<{
    mantenimientoId: string;
    tipo: TipoMantenimiento;
    estado: string;
    fechaProgramada: string;
    taller: string;
    descripcion: string;
    programadoEn: string | null;
    cerradoEn: string | null;
    observaciones: string | null;
    checklist: Array<{ item: string; ok: boolean | null; nota: string | null }>;
  }> | null;
};

export type CombustibleQueryVariables = Exact<{
  desde: string;
}>;

export type CombustibleQuery = {
  anomaliasCombustible: Array<{
    cargaId: string;
    placa: string;
    viajeId: string | null;
    litros: number;
    kmPorLitro: number;
    puntaje: number;
    registradaEn: string;
  }> | null;
  cargasCombustible: Array<{
    cargaId: string;
    viajeId: string;
    placa: string;
    litros: number;
    monto: string;
    kilometraje: number;
    registradaEn: string;
  }> | null;
};

export type ConduccionQueryVariables = Exact<{
  desde?: string | null | undefined;
}>;

export type ConduccionQuery = {
  puntajesConduccion: {
    desde: string;
    hasta: string;
    datosAl: string | null;
    choferes: Array<{ choferId: string; nombre: string | null; frenadas: number; fatigas: number; km: number; puntaje: number }>;
    viajes: Array<{
      viajeId: string | null;
      choferId: string;
      nombre: string | null;
      frenadas: number;
      fatigas: number;
      km: number;
      puntaje: number;
    }>;
  } | null;
};

export type ProgramarMantenimientoMutationVariables = Exact<{
  input: MantenimientoInput;
}>;

export type ProgramarMantenimientoMutation = { programarMantenimiento: { mantenimientoId: string; estado: string } };

export type CerrarMantenimientoMutationVariables = Exact<{
  input: CierreMantenimientoInput;
}>;

export type CerrarMantenimientoMutation = { cerrarMantenimiento: { mantenimientoId: string; estado: string } };

export const UnidadesDocument = gql`
  query Unidades($tipo: TipoUnidad, $estado: EstadoUnidad) {
    unidades(tipo: $tipo, estado: $estado) {
      unidadId
      tipoUnidad
      placa
      tipoRemolque
      estado
      kilometraje
      kmDesdeUltimoMantenimiento
      documentos {
        tipo
        venceEl
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class UnidadesGQL extends Apollo.Query<UnidadesQuery, UnidadesQueryVariables> {
  override document = UnidadesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const UnidadDocument = gql`
  query Unidad($id: ID!) {
    unidad(id: $id) {
      unidadId
      tipoUnidad
      placa
      tipoRemolque
      capacidadToneladas
      estado
      kilometraje
      kmDesdeUltimoMantenimiento
      documentos {
        tipo
        venceEl
      }
      atributos
    }
    mantenimientos(unidadId: $id) {
      mantenimientoId
      tipo
      estado
      fechaProgramada
      taller
      descripcion
      checklist {
        item
        ok
        nota
      }
      programadoEn
      cerradoEn
      observaciones
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class UnidadGQL extends Apollo.Query<UnidadQuery, UnidadQueryVariables> {
  override document = UnidadDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CombustibleDocument = gql`
  query Combustible($desde: Fecha!) {
    anomaliasCombustible(desde: $desde) {
      cargaId
      placa
      viajeId
      litros
      kmPorLitro
      puntaje
      registradaEn
    }
    cargasCombustible(limite: 50) {
      cargaId
      viajeId
      placa
      litros
      monto
      kilometraje
      registradaEn
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class CombustibleGQL extends Apollo.Query<CombustibleQuery, CombustibleQueryVariables> {
  override document = CombustibleDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ConduccionDocument = gql`
  query Conduccion($desde: Fecha) {
    puntajesConduccion(desde: $desde) {
      desde
      hasta
      datosAl
      choferes {
        choferId
        nombre
        frenadas
        fatigas
        km
        puntaje
      }
      viajes {
        viajeId
        choferId
        nombre
        frenadas
        fatigas
        km
        puntaje
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ConduccionGQL extends Apollo.Query<ConduccionQuery, ConduccionQueryVariables> {
  override document = ConduccionDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ProgramarMantenimientoDocument = gql`
  mutation ProgramarMantenimiento($input: MantenimientoInput!) {
    programarMantenimiento(input: $input) {
      mantenimientoId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ProgramarMantenimientoGQL extends Apollo.Mutation<ProgramarMantenimientoMutation, ProgramarMantenimientoMutationVariables> {
  override document = ProgramarMantenimientoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CerrarMantenimientoDocument = gql`
  mutation CerrarMantenimiento($input: CierreMantenimientoInput!) {
    cerrarMantenimiento(input: $input) {
      mantenimientoId
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class CerrarMantenimientoGQL extends Apollo.Mutation<CerrarMantenimientoMutation, CerrarMantenimientoMutationVariables> {
  override document = CerrarMantenimientoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
