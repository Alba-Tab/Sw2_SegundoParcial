import type { Icono } from './iconos';

/** Tono de un estado; cada uno sale de un par de tokens de contenedor (DESIGN.md, "Estados"). */
export type Tono = 'neutro' | 'info' | 'exito' | 'aviso' | 'error';

/** Lo que se muestra en vez del valor crudo de un enum: texto, icono (Material Symbols) y tono. */
export interface Etiqueta {
  texto: string;
  icono: Icono;
  tono: Tono;
}

const e = (texto: string, icono: Icono, tono: Tono = 'neutro'): Etiqueta => ({ texto, icono, tono });

// Un icono, un significado: check_circle = hecho, hourglass_top = espera, block = rechazado, warning = revisar, error = falla.
const ESTADO_VIAJE = {
  PROGRAMANDO: e('Programando', 'hourglass_top', 'info'),
  CONFIRMADO: e('Confirmado', 'event_available', 'info'),
  EN_RUTA: e('En ruta', 'route', 'info'),
  ENTREGADO: e('Entregado', 'check_circle', 'exito'),
  CERRADO: e('Cerrado', 'lock', 'neutro'),
  CANCELADO: e('Cancelado', 'cancel', 'neutro'),
  ENTREGA_OBSERVADA: e('Entrega observada', 'warning', 'aviso'),
  ENTREGA_RECHAZADA: e('Entrega rechazada', 'block', 'error'),
  REQUIERE_INTERVENCION: e('Requiere intervención', 'error', 'error'),
};

/**
 * Por grupo, la etiqueta de cada valor. Los grupos con nombre de enum GraphQL (contratos/graphql/centro-control.graphql)
 * los cubre la prueba; los demás son campos `String` del esquema con valores cerrados en contratos/openapi.
 */
export const ETIQUETAS = {
  EstadoViaje: ESTADO_VIAJE,
  EstadoServicio: ESTADO_VIAJE,
  TipoCarga: {
    GRANOS: e('Granos', 'grass'),
    INSUMOS: e('Insumos', 'inventory_2'),
    INSUMOS_LIQUIDOS: e('Insumos líquidos', 'water_drop'),
    CONTENEDOR: e('Contenedor', 'package_2'),
  },
  TipoUnidad: {
    TRACTO: e('Tracto', 'local_shipping'),
    REMOLQUE: e('Remolque', 'rv_hookup'),
  },
  EstadoUnidad: {
    DISPONIBLE: e('Disponible', 'check_circle', 'exito'),
    RESERVADA: e('Reservada', 'bookmark', 'info'),
    EN_VIAJE: e('En viaje', 'route', 'info'),
    MANTENIMIENTO_PENDIENTE: e('Mantenimiento pendiente', 'warning', 'aviso'),
    EN_MANTENIMIENTO: e('En mantenimiento', 'build', 'neutro'),
    INACTIVA: e('Inactiva', 'do_not_disturb_on', 'neutro'),
  },
  TipoMantenimiento: {
    PREVENTIVO: e('Preventivo', 'event_repeat'),
    CORRECTIVO: e('Correctivo', 'build'),
    DOCUMENTOS: e('Documentos', 'description'),
  },
  EstadoFactura: {
    EMITIDA: e('Por cobrar', 'receipt_long', 'info'),
    PAGADA_PARCIAL: e('Pago parcial', 'hourglass_top', 'aviso'),
    PAGADA: e('Pagada', 'check_circle', 'exito'),
  },
  MedioPago: {
    TRANSFERENCIA: e('Transferencia', 'sync_alt'),
    DEPOSITO: e('Depósito', 'account_balance'),
    EFECTIVO: e('Efectivo', 'payments'),
    CHEQUE: e('Cheque', 'money'),
  },
  TipoAlerta: {
    ENTREGA_OBSERVADA: e('Entrega observada', 'warning', 'aviso'),
    ENTREGA_RECHAZADA: e('Entrega rechazada', 'block', 'error'),
    VIAJE_REQUIERE_INTERVENCION: e('Viaje requiere intervención', 'error', 'error'),
    MANTENIMIENTO_REQUERIDO: e('Mantenimiento requerido', 'warning', 'aviso'),
    CAIDA_COMBUSTIBLE: e('Caída de combustible', 'local_gas_station', 'aviso'),
    ANOMALIA_COMBUSTIBLE: e('Anomalía de combustible', 'query_stats', 'aviso'),
    RIESGO_RETRASO: e('Riesgo de retraso', 'schedule', 'aviso'),
    ACCION_PROPUESTA: e('Acción propuesta', 'smart_toy', 'info'),
  },
  EstadoAlerta: {
    ABIERTA: e('Abierta', 'radio_button_unchecked', 'aviso'),
    ATENDIDA: e('Atendida', 'check', 'info'),
    RESUELTA: e('Resuelta', 'check_circle', 'exito'),
  },
  EstadoAccion: {
    PENDIENTE: e('Pendiente', 'hourglass_top', 'aviso'),
    APROBADA: e('Aprobada', 'thumb_up', 'info'),
    EJECUTADA: e('Ejecutada', 'check_circle', 'exito'),
    RECHAZADA: e('Rechazada', 'block', 'neutro'),
    ARCHIVADA: e('Archivada', 'archive', 'neutro'),
  },
  Rol: {
    gerente: e('Gerente', 'badge'),
    despachador: e('Despachador', 'badge'),
    jefe_flota: e('Jefe de flota', 'badge'),
    administracion: e('Administración', 'badge'),
    comercial: e('Atención comercial', 'badge'),
  },
  // Campos String del esquema; valores de contratos/openapi.
  SeveridadAlerta: {
    MEDIA: e('Severidad media', 'info', 'info'),
    ALTA: e('Severidad alta', 'warning', 'aviso'),
    CRITICA: e('Severidad crítica', 'error', 'error'),
  },
  EstadoMantenimiento: {
    EN_CURSO: e('En curso', 'build', 'info'),
    CERRADO: e('Cerrado', 'lock', 'neutro'),
  },
  EstadoMision: {
    EN_CURSO: e('En curso', 'sync', 'info'),
    COMPLETADA: e('Completada', 'check_circle', 'exito'),
    AGOTADA: e('Agotada', 'timer_off', 'aviso'),
    SALTADA: e('Saltada', 'skip_next', 'aviso'),
    FALLIDA: e('Fallida', 'error', 'error'),
  },
  /** `Mision.codigo` (analitica.yaml): por qué quedó SALTADA, FALLIDA o AGOTADA; texto libre en el contrato, estos son los que da Analítica. */
  MotivoMision: {
    LLM_NO_DISPONIBLE: e('Asistente no disponible', 'cloud_off', 'aviso'),
    DEPENDENCIA_NO_DISPONIBLE: e('Un servicio no respondió', 'cloud_off', 'aviso'),
    INTERRUMPIDA: e('Se interrumpió', 'error', 'error'),
    ERROR_INTERNO: e('Error interno', 'error', 'error'),
    // Misión AGOTADA: Analítica la cierra con este código al llegar al tope de pasos (E-9, V2-8).
    LIMITE: e('Llegó al límite de pasos', 'timer_off', 'aviso'),
  },
  OrigenMision: {
    PROGRAMADA: e('Programada', 'event_repeat'),
    MANUAL: e('Manual', 'touch_app'),
  },
  EstadoCotizacion: {
    VIGENTE: e('Vigente', 'timer', 'info'),
    ACEPTADA: e('Aceptada', 'check_circle', 'exito'),
    VENCIDA: e('Vencida', 'event_busy', 'neutro'),
  },
  CanalCotizacion: {
    PORTAL: e('Portal', 'language'),
    TELEFONO: e('Teléfono', 'call'),
  },
  EstadoAprobacion: {
    PENDIENTE: e('Pendiente', 'hourglass_top', 'aviso'),
    APROBADA: e('Aprobada', 'thumb_up', 'exito'),
    RECHAZADA: e('Rechazada', 'block', 'neutro'),
    VENCIDA: e('Vencida', 'event_busy', 'neutro'),
  },
  MotivoAprobacion: {
    MORA: e('Facturas en mora', 'money_off'),
    MONTO_ALTO: e('Monto alto', 'trending_up'),
  },
  TipoRemolque: {
    FURGON: e('Furgón', 'rv_hookup'),
    PLATAFORMA: e('Plataforma', 'rv_hookup'),
    CISTERNA: e('Cisterna', 'rv_hookup'),
  },
  TipoDocumento: {
    SOAT: e('SOAT', 'health_and_safety'),
    INSPECCION_TECNICA: e('Inspección técnica', 'fact_check'),
  },
  TipoHito: {
    BLOQUEO: e('Bloqueo', 'remove_road', 'aviso'),
    PARADA: e('Parada', 'pause_circle', 'neutro'),
    PUNTO_CONTROL: e('Punto de control', 'where_to_vote', 'info'),
    FALLA_MECANICA: e('Falla mecánica', 'car_repair', 'error'),
    OTRO: e('Otro', 'more_horiz', 'neutro'),
  },
  OrigenHito: {
    VOZ: e('por voz', 'mic'),
    TEXTO: e('por texto', 'keyboard'),
  },
  TipoEntrega: {
    ENTREGA: e('Entrega', 'check_circle', 'exito'),
    RECHAZO_RECEPTOR: e('Rechazo en destino', 'block', 'error'),
  },
  RazonObservacion: {
    FUERA_GEOCERCA: e('Fuera de la geocerca', 'wrong_location', 'aviso'),
    SIN_FIRMA: e('Sin firma', 'draw', 'aviso'),
  },
  Riesgo: {
    EN_RIESGO: e('Riesgo', 'schedule', 'aviso'),
  },
  // Calculados en el front (no vienen del esquema): ver `vigencia`, `estadoLineaCredito` y `estadoChofer`.
  Vigencia: {
    VIGENTE: e('Vigente', 'check_circle', 'exito'),
    POR_VENCER: e('Por vencer', 'warning', 'aviso'),
    VENCIDO: e('Vencido', 'event_busy', 'error'),
  },
  EstadoLineaCredito: {
    AL_DIA: e('Al día', 'check_circle', 'exito'),
    SIN_DISPONIBLE: e('Sin disponible', 'warning', 'aviso'),
    EN_MORA: e('En mora', 'money_off', 'error'),
  },
  EstadoChofer: {
    DISPONIBLE: e('Disponible', 'check_circle', 'exito'),
    OCUPADO: e('Ocupado', 'assignment_ind', 'info'),
    INACTIVO: e('Inhabilitado', 'person_off', 'neutro'),
  },
} satisfies Record<string, Record<string, Etiqueta>>;

export type GrupoEtiqueta = keyof typeof ETIQUETAS;

/** Para ordenar por estado: la posición del valor en su grupo (el orden del ciclo de vida), no el texto alfabético (C-10). */
export function posicionEstado(grupo: GrupoEtiqueta, valor: string | null | undefined): number | null {
  const i = valor ? Object.keys(ETIQUETAS[grupo]).indexOf(valor) : -1;
  return i < 0 ? null : i;
}

/** "MANTENIMIENTO_PENDIENTE" → "Mantenimiento pendiente": para un valor que el mapa aún no conoce. */
export const legible = (valor: string): string => (valor.charAt(0) + valor.slice(1).toLowerCase()).replaceAll('_', ' ');

/** La etiqueta del valor; si el backend manda uno nuevo, sale legible y neutro en vez de crudo. */
export function etiqueta(grupo: GrupoEtiqueta, valor: string | null | undefined): Etiqueta {
  if (!valor) return e('Sin dato', 'remove');
  return (ETIQUETAS[grupo] as Record<string, Etiqueta>)[valor] ?? e(legible(valor), 'help');
}
