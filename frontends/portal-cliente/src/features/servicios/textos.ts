/** Por qué terminó CANCELADO un servicio (códigos de 000 §5), en palabras del cliente. */
export const MOTIVOS: Record<string, string> = {
  COTIZACION_VENCIDA: 'La cotización venció antes de confirmar. Pide una nueva.',
  CREDITO_INSUFICIENTE: 'Tu crédito disponible no alcanza para este servicio.',
  CREDITO_RECHAZADO: 'Administración no aprobó el crédito para este servicio.',
  APROBACION_VENCIDA: 'La aprobación de crédito no llegó a tiempo.',
  SIN_UNIDAD_COMPATIBLE: 'No hay una unidad disponible para esa carga y fecha.',
  CANCELADO_POR_USUARIO: 'Cancelaste el servicio.',
  RESUELTO_MANUALMENTE: 'La empresa cerró el servicio después de revisarlo.',
};

/** Paso de la saga mientras el servicio está PROGRAMANDO (spec 003). */
export const ETAPAS: Record<string, string> = {
  INICIANDO: 'Registrando tu pedido…',
  VALIDANDO_CREDITO: 'Revisando tu crédito…',
  ESPERANDO_APROBACION: 'En aprobación: administración está revisando tu crédito.',
  RESERVANDO_UNIDAD: 'Buscando unidad y chofer…',
  CONFIRMANDO: 'Confirmando…',
  COMPENSANDO: 'No se pudo confirmar; deshaciendo las reservas…',
  DESCONOCIDA: 'Procesando…',
};

/** Errores de la cancelación (spec 004). */
export const ERRORES_CANCELACION: Record<string, string> = {
  CONFIRMACION_EN_CURSO: 'Tu servicio todavía se está confirmando. Intenta cancelar cuando esté confirmado.',
  CANCELACION_NO_PERMITIDA: 'El viaje ya salió. Para cancelarlo, llama a atención comercial.',
  CONFLICTO_ESTADO: 'El servicio ya no se puede cancelar.',
};
