/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import * as Apollo from 'apollo-angular';
export type EstadoFactura = 'EMITIDA' | 'PAGADA' | 'PAGADA_PARCIAL';

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

export type MedioPago = 'CHEQUE' | 'DEPOSITO' | 'EFECTIVO' | 'TRANSFERENCIA';

export type PagoInput = {
  claveIdempotencia: string | number;
  facturaId: string | number;
  fecha: string;
  medio: MedioPago;
  monto: string;
  nota?: string | null | undefined;
  referencia: string;
};

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

export type TipoCarga = 'CONTENEDOR' | 'GRANOS' | 'INSUMOS' | 'INSUMOS_LIQUIDOS';

export type FacturaFilaFragment = {
  facturaId: string;
  numero: string;
  clienteId: string;
  razonSocial: string;
  monto: string;
  saldo: string;
  estado: EstadoFactura;
  emitidaEl: string;
  venceEl: string;
  vencida: boolean;
  diasVencida: number | null;
};

export type FacturasQueryVariables = Exact<{
  estado?: EstadoFactura | null | undefined;
  conSaldo?: boolean | null | undefined;
}>;

export type FacturasQuery = {
  facturas: Array<{
    facturaId: string;
    numero: string;
    clienteId: string;
    razonSocial: string;
    monto: string;
    saldo: string;
    estado: EstadoFactura;
    emitidaEl: string;
    venceEl: string;
    vencida: boolean;
    diasVencida: number | null;
  }> | null;
};

export type FacturaQueryVariables = Exact<{
  id: string | number;
}>;

export type FacturaQuery = {
  factura: {
    viajeId: string;
    servicioId: string;
    facturaId: string;
    numero: string;
    clienteId: string;
    razonSocial: string;
    monto: string;
    saldo: string;
    estado: EstadoFactura;
    emitidaEl: string;
    venceEl: string;
    vencida: boolean;
    diasVencida: number | null;
    pagos: Array<{
      pagoId: string;
      monto: string;
      fecha: string;
      medio: MedioPago;
      referencia: string;
      nota: string | null;
      registradoPor: string | null;
      registradoEn: string | null;
    }> | null;
  } | null;
};

export type CotizacionesQueryVariables = Exact<{ [key: string]: never }>;

export type CotizacionesQuery = {
  cotizaciones: Array<{
    cotizacionId: string;
    clienteId: string;
    rutaId: string;
    tipoCarga: TipoCarga;
    toneladas: number;
    fechaViaje: string;
    monto: string;
    estado: string;
    vencida: boolean;
    venceEn: string | null;
    canal: string | null;
    creadaEn: string | null;
  }> | null;
  clientes: Array<{ clienteId: string; razonSocial: string }> | null;
  rutas: Array<{ rutaId: string; nombre: string }> | null;
};

export type SolicitudesQueryVariables = Exact<{
  estado?: string | null | undefined;
}>;

export type SolicitudesQuery = {
  solicitudesAprobacion: Array<{
    servicioId: string;
    clienteId: string;
    razonSocial: string;
    monto: string;
    motivos: Array<string>;
    estado: string;
    creadaEn: string;
    venceEn: string;
    decididaPor: string | null;
    motivoDecision: string | null;
    facturasVencidas: Array<{
      facturaId: string;
      numero: string;
      saldo: string;
      venceEl: string;
      diasVencida: number;
    }> | null;
  }> | null;
};

export type LineaCreditoQueryVariables = Exact<{
  clienteId: string | number;
}>;

export type LineaCreditoQuery = {
  lineaCredito: {
    limite: string;
    reservado: string;
    utilizado: string;
    disponible: string;
    enMora: boolean;
  } | null;
};

export type CobranzaQueryVariables = Exact<{
  params?: ReporteParams | null | undefined;
}>;

export type CobranzaQuery = {
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

export type RegistrarPagoMutationVariables = Exact<{
  input: PagoInput;
}>;

export type RegistrarPagoMutation = {
  registrarPago: { facturaId: string; saldo: string; estado: EstadoFactura };
};

export type AprobarCreditoMutationVariables = Exact<{
  servicioId: string | number;
  aprobado: boolean;
  motivo?: string | null | undefined;
  clave: string | number;
}>;

export type AprobarCreditoMutation = {
  aprobarCredito: {
    servicioId: string;
    aprobado: boolean;
    servicio: { estado: EstadoServicio } | null;
  };
};

export const FacturaFilaFragmentDoc = gql`
  fragment FacturaFila on Factura {
    facturaId
    numero
    clienteId
    razonSocial
    monto
    saldo
    estado
    emitidaEl
    venceEl
    vencida
    diasVencida
  }
`;
export const FacturasDocument = gql`
  query Facturas($estado: EstadoFactura, $conSaldo: Boolean) {
    facturas(estado: $estado, conSaldo: $conSaldo, limite: 100) {
      ...FacturaFila
    }
  }
  ${FacturaFilaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class FacturasGQL extends Apollo.Query<FacturasQuery, FacturasQueryVariables> {
  override document = FacturasDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const FacturaDocument = gql`
  query Factura($id: ID!) {
    factura(id: $id) {
      ...FacturaFila
      viajeId
      servicioId
      pagos {
        pagoId
        monto
        fecha
        medio
        referencia
        nota
        registradoPor
        registradoEn
      }
    }
  }
  ${FacturaFilaFragmentDoc}
`;

@Injectable({
  providedIn: 'root',
})
export class FacturaGQL extends Apollo.Query<FacturaQuery, FacturaQueryVariables> {
  override document = FacturaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CotizacionesDocument = gql`
  query Cotizaciones {
    cotizaciones(limite: 100) {
      cotizacionId
      clienteId
      rutaId
      tipoCarga
      toneladas
      fechaViaje
      monto
      estado
      vencida
      venceEn
      canal
      creadaEn
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
export class CotizacionesGQL extends Apollo.Query<CotizacionesQuery, CotizacionesQueryVariables> {
  override document = CotizacionesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const SolicitudesDocument = gql`
  query Solicitudes($estado: String) {
    solicitudesAprobacion(estado: $estado) {
      servicioId
      clienteId
      razonSocial
      monto
      motivos
      estado
      creadaEn
      venceEn
      decididaPor
      motivoDecision
      facturasVencidas {
        facturaId
        numero
        saldo
        venceEl
        diasVencida
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class SolicitudesGQL extends Apollo.Query<SolicitudesQuery, SolicitudesQueryVariables> {
  override document = SolicitudesDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const LineaCreditoDocument = gql`
  query LineaCredito($clienteId: ID!) {
    lineaCredito(clienteId: $clienteId) {
      limite
      reservado
      utilizado
      disponible
      enMora
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class LineaCreditoGQL extends Apollo.Query<LineaCreditoQuery, LineaCreditoQueryVariables> {
  override document = LineaCreditoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const CobranzaDocument = gql`
  query Cobranza($params: ReporteParams) {
    reporte(id: CUENTAS_POR_COBRAR, params: $params) {
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
export class CobranzaGQL extends Apollo.Query<CobranzaQuery, CobranzaQueryVariables> {
  override document = CobranzaDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const RegistrarPagoDocument = gql`
  mutation RegistrarPago($input: PagoInput!) {
    registrarPago(input: $input) {
      facturaId
      saldo
      estado
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class RegistrarPagoGQL extends Apollo.Mutation<RegistrarPagoMutation, RegistrarPagoMutationVariables> {
  override document = RegistrarPagoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
export const AprobarCreditoDocument = gql`
  mutation AprobarCredito($servicioId: ID!, $aprobado: Boolean!, $motivo: String, $clave: ID!) {
    aprobarCredito(servicioId: $servicioId, aprobado: $aprobado, motivo: $motivo, claveIdempotencia: $clave) {
      servicioId
      aprobado
      servicio {
        estado
      }
    }
  }
`;

@Injectable({
  providedIn: 'root',
})
export class AprobarCreditoGQL extends Apollo.Mutation<AprobarCreditoMutation, AprobarCreditoMutationVariables> {
  override document = AprobarCreditoDocument;

  constructor(apollo: Apollo.Apollo) {
    super(apollo);
  }
}
