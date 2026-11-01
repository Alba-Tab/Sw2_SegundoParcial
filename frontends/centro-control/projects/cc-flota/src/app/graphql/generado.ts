/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
/** Edición de un chofer (D104). Los choferes no tienen alta: llegan de Keycloak y la semilla. */
export type ChoferEdicionInput = {
  choferId: string | number;
  claveIdempotencia: string | number;
  /** A, B o C. */
  licenciaCategoria: string;
  licenciaVenceEl: string;
  nombre: string;
};

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

/** Edición de una unidad y de sus documentos (spec 010, D104): placa, estado y kilómetros no se editan. */
export type UnidadEdicionInput = {
  atributos: any;
  capacidadToneladas?: number | null | undefined;
  claveIdempotencia: string | number;
  documentos: Array<DocumentoInput>;
  unidadId: string | number;
};

/** Alta de un tracto o remolque (spec 010, D104). Flota valida los atributos de cada tipo (D76). */
export type UnidadNuevaInput = {
  atributos: any;
  /** Obligatoria en remolques; prohibida en tractos. */
  capacidadToneladas?: number | null | undefined;
  claveIdempotencia: string | number;
  /** Un SOAT y una INSPECCION_TECNICA. */
  documentos: Array<DocumentoInput>;
  /** Odómetro, solo en tractos. */
  kilometraje?: number | null | undefined;
  kmDesdeUltimoMantenimiento: number;
  placa: string;
  /** Solo en remolques: FURGON, PLATAFORMA o CISTERNA. */
  tipoRemolque?: string | null | undefined;
  tipoUnidad: TipoUnidad;
};

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

export type MantenimientosQueryVariables = Exact<{ [key: string]: never }>;

export type MantenimientosQuery = {
  mantenimientos: Array<{
    mantenimientoId: string;
    unidadId: string;
    placa: string;
    tipo: TipoMantenimiento;
    estado: string;
    fechaProgramada: string;
    taller: string;
    descripcion: string;
    cerradoEn: string | null;
  }> | null;
};

export type ChoferesQueryVariables = Exact<{ [key: string]: never }>;

export type ChoferesQuery = {
  choferes: Array<{
    choferId: string;
    nombre: string;
    licenciaCategoria: string;
    licenciaVenceEl: string;
    activo: boolean;
    disponible: boolean;
  }> | null;
};

export type ChoferQueryVariables = Exact<{
  choferId: string | number;
}>;

export type ChoferQuery = {
  chofer: {
    choferId: string;
    nombre: string;
    licenciaCategoria: string;
    licenciaVenceEl: string;
    activo: boolean;
    disponible: boolean;
    motivoInhabilitacion: string | null;
  } | null;
  puntajesConduccion: {
    desde: string;
    hasta: string;
    choferes: Array<{ choferId: string; frenadas: number; fatigas: number; km: number; puntaje: number }>;
    viajes: Array<{ viajeId: string | null; frenadas: number; fatigas: number; km: number; puntaje: number }>;
  } | null;
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
  unidades: Array<{ unidadId: string; placa: string }> | null;
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

export type UnidadGestionadaFragment = {
  unidadId: string;
  estado: EstadoUnidad;
  capacidadToneladas: number | null;
  atributos: any;
  documentos: Array<{ tipo: string; venceEl: string }>;
};

export type CrearUnidadMutationVariables = Exact<{
  input: UnidadNuevaInput;
}>;

export type CrearUnidadMutation = {
  crearUnidad: {
    unidadId: string;
    estado: EstadoUnidad;
    capacidadToneladas: number | null;
    atributos: any;
    documentos: Array<{ tipo: string; venceEl: string }>;
  };
};

export type EditarUnidadMutationVariables = Exact<{
  input: UnidadEdicionInput;
}>;

export type EditarUnidadMutation = {
  editarUnidad: {
    unidadId: string;
    estado: EstadoUnidad;
    capacidadToneladas: number | null;
    atributos: any;
    documentos: Array<{ tipo: string; venceEl: string }>;
  };
};

export type DarDeBajaUnidadMutationVariables = Exact<{
  unidadId: string | number;
  motivo: string;
  claveIdempotencia: string | number;
}>;

export type DarDeBajaUnidadMutation = {
  darDeBajaUnidad: {
    unidadId: string;
    estado: EstadoUnidad;
    capacidadToneladas: number | null;
    atributos: any;
    documentos: Array<{ tipo: string; venceEl: string }>;
  };
};

export type ChoferGestionadoFragment = {
  choferId: string;
  nombre: string;
  licenciaCategoria: string;
  licenciaVenceEl: string;
  activo: boolean;
  disponible: boolean;
  motivoInhabilitacion: string | null;
};

export type EditarChoferMutationVariables = Exact<{
  input: ChoferEdicionInput;
}>;

export type EditarChoferMutation = {
  editarChofer: {
    choferId: string;
    nombre: string;
    licenciaCategoria: string;
    licenciaVenceEl: string;
    activo: boolean;
    disponible: boolean;
    motivoInhabilitacion: string | null;
  };
};

export type CambiarHabilitacionChoferMutationVariables = Exact<{
  choferId: string | number;
  activo: boolean;
  motivo?: string | null | undefined;
  claveIdempotencia: string | number;
}>;

export type CambiarHabilitacionChoferMutation = {
  cambiarHabilitacionChofer: {
    choferId: string;
    nombre: string;
    licenciaCategoria: string;
    licenciaVenceEl: string;
    activo: boolean;
    disponible: boolean;
    motivoInhabilitacion: string | null;
  };
};

export const UnidadGestionadaFragmentDoc = gql`
  fragment UnidadGestionada on Unidad {
    unidadId
    estado
    capacidadToneladas
    documentos {
      tipo
      venceEl
    }
    atributos
  }
`;
export const ChoferGestionadoFragmentDoc = gql`
  fragment ChoferGestionado on Chofer {
    choferId
    nombre
    licenciaCategoria
    licenciaVenceEl
    activo
    disponible
    motivoInhabilitacion
  }
`;
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
export const MantenimientosDocument = gql`
  query Mantenimientos {
    mantenimientos {
      mantenimientoId
      unidadId
      placa
      tipo
      estado
      fechaProgramada
      taller
      descripcion
      cerradoEn
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class MantenimientosGQL extends Apollo.Query<MantenimientosQuery, MantenimientosQueryVariables> {
  override document = MantenimientosDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ChoferesDocument = gql`
  query Choferes {
    choferes {
      choferId
      nombre
      licenciaCategoria
      licenciaVenceEl
      activo
      disponible
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ChoferesGQL extends Apollo.Query<ChoferesQuery, ChoferesQueryVariables> {
  override document = ChoferesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ChoferDocument = gql`
  query Chofer($choferId: ID!) {
    chofer(id: $choferId) {
      choferId
      nombre
      licenciaCategoria
      licenciaVenceEl
      activo
      disponible
      motivoInhabilitacion
    }
    puntajesConduccion(choferId: $choferId) {
      desde
      hasta
      choferes {
        choferId
        frenadas
        fatigas
        km
        puntaje
      }
      viajes {
        viajeId
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
export class ChoferGQL extends Apollo.Query<ChoferQuery, ChoferQueryVariables> {
  override document = ChoferDocument;

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
    unidades {
      unidadId
      placa
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
export const CrearUnidadDocument = gql`
  mutation CrearUnidad($input: UnidadNuevaInput!) {
    crearUnidad(input: $input) {
      ...UnidadGestionada
    }
  }
  ${UnidadGestionadaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class CrearUnidadGQL extends Apollo.Mutation<CrearUnidadMutation, CrearUnidadMutationVariables> {
  override document = CrearUnidadDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const EditarUnidadDocument = gql`
  mutation EditarUnidad($input: UnidadEdicionInput!) {
    editarUnidad(input: $input) {
      ...UnidadGestionada
    }
  }
  ${UnidadGestionadaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class EditarUnidadGQL extends Apollo.Mutation<EditarUnidadMutation, EditarUnidadMutationVariables> {
  override document = EditarUnidadDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const DarDeBajaUnidadDocument = gql`
  mutation DarDeBajaUnidad($unidadId: ID!, $motivo: String!, $claveIdempotencia: ID!) {
    darDeBajaUnidad(unidadId: $unidadId, motivo: $motivo, claveIdempotencia: $claveIdempotencia) {
      ...UnidadGestionada
    }
  }
  ${UnidadGestionadaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class DarDeBajaUnidadGQL extends Apollo.Mutation<DarDeBajaUnidadMutation, DarDeBajaUnidadMutationVariables> {
  override document = DarDeBajaUnidadDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const EditarChoferDocument = gql`
  mutation EditarChofer($input: ChoferEdicionInput!) {
    editarChofer(input: $input) {
      ...ChoferGestionado
    }
  }
  ${ChoferGestionadoFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class EditarChoferGQL extends Apollo.Mutation<EditarChoferMutation, EditarChoferMutationVariables> {
  override document = EditarChoferDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CambiarHabilitacionChoferDocument = gql`
  mutation CambiarHabilitacionChofer($choferId: ID!, $activo: Boolean!, $motivo: String, $claveIdempotencia: ID!) {
    cambiarHabilitacionChofer(choferId: $choferId, activo: $activo, motivo: $motivo, claveIdempotencia: $claveIdempotencia) {
      ...ChoferGestionado
    }
  }
  ${ChoferGestionadoFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class CambiarHabilitacionChoferGQL extends Apollo.Mutation<
  CambiarHabilitacionChoferMutation,
  CambiarHabilitacionChoferMutationVariables
> {
  override document = CambiarHabilitacionChoferDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
