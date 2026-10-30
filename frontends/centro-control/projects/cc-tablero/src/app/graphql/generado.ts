/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
export type Periodo = 'ESTA_SEMANA' | 'ESTE_MES' | 'HOY';

export type ReporteId = 'CONSUMO_COMBUSTIBLE' | 'CUENTAS_POR_COBRAR' | 'FACTURACION_POR_CLIENTE' | 'RENTABILIDAD' | 'VIAJES_EN_RIESGO';

export type ReporteParams = {
  agrupar?: string | null | undefined;
  clienteId?: string | number | null | undefined;
  desde?: string | null | undefined;
  hasta?: string | null | undefined;
  incluirVencidas?: boolean | null | undefined;
  placa?: string | null | undefined;
  rutaId?: string | number | null | undefined;
  umbral?: number | null | undefined;
};

export type Rol = 'administracion' | 'comercial' | 'despachador' | 'gerente' | 'jefe_flota';

export type TableroQueryVariables = Exact<{
  periodo: Periodo;
}>;

export type TableroQuery = {
  tablero: {
    periodo: Periodo;
    alertasAbiertas: number | null;
    datosAl: string | null;
    viajesEnCurso: Array<{
      viajeId: string;
      placa: string | null;
      choferNombre: string | null;
      cliente: { razonSocial: string };
      ruta: { nombre: string };
      riesgo: { probabilidad: number; enRiesgo: boolean } | null;
    }> | null;
    unidadesPorEstado: Array<{ estado: string; cantidad: number }> | null;
    cuentasPorCobrar: {
      saldoTotal: string;
      facturasPorVencer: number;
      facturasVencidas: number;
      proximas: Array<{ facturaId: string; numero: string; razonSocial: string; saldo: string; venceEl: string }>;
    } | null;
  };
};

export type CatalogoQueryVariables = Exact<{ [key: string]: never }>;

export type CatalogoQuery = {
  catalogoReportes: Array<{
    reporteId: ReporteId;
    titulo: string;
    descripcion: string;
    roles: Array<Rol>;
    maxDias: number | null;
    parametros: any;
  }> | null;
  clientes: Array<{ clienteId: string; razonSocial: string }> | null;
  rutas: Array<{ rutaId: string; nombre: string }> | null;
};

export type ReporteQueryVariables = Exact<{
  id: ReporteId;
  params?: ReporteParams | null | undefined;
}>;

export type ReporteQuery = {
  reporte: {
    reporteId: ReporteId;
    titulo: string;
    parametros: any;
    filas: Array<any>;
    totales: any;
    grafico: any;
    datosAl: string | null;
    columnas: Array<{ clave: string; titulo: string; tipo: string }>;
  } | null;
};

export type ExportarReporteMutationVariables = Exact<{
  id: ReporteId;
  params?: ReporteParams | null | undefined;
  clave: string | number;
}>;

export type ExportarReporteMutation = { exportarReporte: { url: string; nombreArchivo: string; expiraEn: string } };

export type PreguntarMutationVariables = Exact<{
  texto: string;
}>;

export type PreguntarMutation = {
  preguntar: {
    tipo: string;
    texto: string;
    reporteId: ReporteId | null;
    parametros: any;
    exportable: boolean | null;
    resultado: {
      reporteId: ReporteId;
      titulo: string;
      parametros: any;
      filas: Array<any>;
      totales: any;
      grafico: any;
      datosAl: string | null;
      columnas: Array<{ clave: string; titulo: string; tipo: string }>;
    } | null;
    opciones: Array<{ etiqueta: string; reporteId: ReporteId; parametros: any }> | null;
  };
};

export type MisionesQueryVariables = Exact<{ [key: string]: never }>;

export type MisionesQuery = {
  misionesAgente: Array<{
    misionId: string;
    estado: string;
    origen: string;
    disparadaPor: string | null;
    iniciadaEn: string;
    terminadaEn: string | null;
    codigo: string | null;
    traceId: string | null;
    accionesCreadas: number | null;
    conclusion: string | null;
    pasos: Array<{ numero: number; herramienta: string; argumentos: any; resumen: string | null; error: boolean | null; ms: number }>;
  }> | null;
};

export type DispararMisionMutationVariables = Exact<{
  clave: string | number;
}>;

export type DispararMisionMutation = { dispararMision: { misionId: string } };

export const TableroDocument = gql`
  query Tablero($periodo: Periodo!) {
    tablero(periodo: $periodo) {
      periodo
      viajesEnCurso {
        viajeId
        placa
        choferNombre
        cliente {
          razonSocial
        }
        ruta {
          nombre
        }
        riesgo {
          probabilidad
          enRiesgo
        }
      }
      unidadesPorEstado {
        estado
        cantidad
      }
      cuentasPorCobrar {
        saldoTotal
        facturasPorVencer
        facturasVencidas
        proximas {
          facturaId
          numero
          razonSocial
          saldo
          venceEl
        }
      }
      alertasAbiertas
      datosAl
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class TableroGQL extends Apollo.Query<TableroQuery, TableroQueryVariables> {
  override document = TableroDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CatalogoDocument = gql`
  query Catalogo {
    catalogoReportes {
      reporteId
      titulo
      descripcion
      roles
      maxDias
      parametros
    }
    clientes {
      clienteId
      razonSocial
    }
    rutas {
      rutaId
      nombre
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class CatalogoGQL extends Apollo.Query<CatalogoQuery, CatalogoQueryVariables> {
  override document = CatalogoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ReporteDocument = gql`
  query Reporte($id: ReporteId!, $params: ReporteParams) {
    reporte(id: $id, params: $params) {
      reporteId
      titulo
      parametros
      columnas {
        clave
        titulo
        tipo
      }
      filas
      totales
      grafico
      datosAl
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ReporteGQL extends Apollo.Query<ReporteQuery, ReporteQueryVariables> {
  override document = ReporteDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const ExportarReporteDocument = gql`
  mutation ExportarReporte($id: ReporteId!, $params: ReporteParams, $clave: ID!) {
    exportarReporte(id: $id, params: $params, claveIdempotencia: $clave) {
      url
      nombreArchivo
      expiraEn
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class ExportarReporteGQL extends Apollo.Mutation<ExportarReporteMutation, ExportarReporteMutationVariables> {
  override document = ExportarReporteDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const PreguntarDocument = gql`
  mutation Preguntar($texto: String!) {
    preguntar(texto: $texto) {
      tipo
      texto
      reporteId
      parametros
      exportable
      resultado {
        reporteId
        titulo
        parametros
        columnas {
          clave
          titulo
          tipo
        }
        filas
        totales
        grafico
        datosAl
      }
      opciones {
        etiqueta
        reporteId
        parametros
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class PreguntarGQL extends Apollo.Mutation<PreguntarMutation, PreguntarMutationVariables> {
  override document = PreguntarDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const MisionesDocument = gql`
  query Misiones {
    misionesAgente(limite: 20) {
      misionId
      estado
      origen
      disparadaPor
      iniciadaEn
      terminadaEn
      codigo
      traceId
      accionesCreadas
      conclusion
      pasos {
        numero
        herramienta
        argumentos
        resumen
        error
        ms
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class MisionesGQL extends Apollo.Query<MisionesQuery, MisionesQueryVariables> {
  override document = MisionesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const DispararMisionDocument = gql`
  mutation DispararMision($clave: ID!) {
    dispararMision(claveIdempotencia: $clave) {
      misionId
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class DispararMisionGQL extends Apollo.Mutation<DispararMisionMutation, DispararMisionMutationVariables> {
  override document = DispararMisionDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
