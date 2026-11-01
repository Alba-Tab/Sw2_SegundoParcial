/**
 * Lo que se dice en pantalla por cada `codigo` de 000 §5 (PRODUCT.md, "Tono"): nunca el mensaje técnico del servidor
 * ni el código. Un solo lugar para las 4 apps; el portal tiene su espejo en `compartido/ui/Problema.tsx`.
 */
export const MENSAJES_ERROR: Record<string, string> = {
  VALIDACION: 'Hay datos que no son válidos. Revisa el formulario.',
  NO_AUTENTICADO: 'Tu sesión terminó. Vuelve a ingresar.',
  SIN_PERMISO: 'Tu rol no tiene permiso para esta operación.',
  NO_ENCONTRADO: 'No se encontró. Puede que el enlace esté mal o que ya no exista.',
  CONFLICTO_ESTADO: 'El estado cambió mientras lo mirabas. Actualiza la pantalla y vuelve a intentar.',
  VERSION_DESACTUALIZADA: 'Otra persona cambió estos datos. Actualiza la pantalla y vuelve a intentar.',
  IDEMPOTENCIA_EN_PROCESO: 'La operación anterior todavía se está procesando. Espera unos segundos.',
  IDEMPOTENCIA_CUERPO_DISTINTO: 'Esa operación ya se registró con otros datos.',
  COTIZACION_VENCIDA: 'La cotización venció. Hay que pedir una nueva.',
  COTIZACION_AJENA: 'La cotización es de otro cliente.',
  CREDITO_INSUFICIENTE: 'El cliente no tiene crédito disponible suficiente.',
  CREDITO_RECHAZADO: 'El crédito de este servicio fue rechazado.',
  SIN_UNIDAD_COMPATIBLE: 'No hay una unidad disponible para esa carga y esa fecha.',
  CLIENTE_NO_REPLICADO: 'El cliente todavía se está preparando en el sistema. Intenta en unos segundos.',
  DEPENDENCIA_NO_DISPONIBLE: 'Un servicio no responde. Intenta de nuevo en unos segundos.',
  ERROR_INTERNO: 'Ocurrió un error inesperado. Intenta de nuevo; si se repite, avisa a soporte.',
  TONELAJE_EXCEDIDO: 'El máximo por servicio es 30 toneladas.',
  APROBACION_VENCIDA: 'La espera de la aprobación venció; ya no se puede decidir.',
  CONFIRMACION_EN_CURSO: 'La confirmación del servicio sigue en curso. Espera a que termine.',
  CANCELACION_NO_PERMITIDA: 'Este servicio ya no se puede cancelar.',
  VINCULACION_PENDIENTE: 'La cuenta todavía no está vinculada. Intenta en unos minutos.',
  LLM_NO_DISPONIBLE: 'El asistente no está disponible ahora. Usa los reportes con botones.',
  PREGUNTA_FUERA_DE_ALCANCE: 'Esa pregunta no está entre las que se pueden responder.',
  EVIDENCIA_INCOMPLETA: 'La evidencia de la entrega todavía no terminó de subir.',
  PAGO_EXCEDE_SALDO: 'El monto supera el saldo de la factura.',
  PAGO_DUPLICADO: 'Ya hay un pago con esa referencia y ese medio en esta factura.',
  CARGA_EXCEDE_TANQUE: 'Los litros superan la capacidad del tanque.',
  KILOMETRAJE_INVALIDO: 'El kilometraje es menor que el último registrado.',
  PLACA_DUPLICADA: 'Ya hay una unidad con esa placa.',
  LIMITE_PETICIONES: 'Se hicieron demasiadas consultas seguidas. Espera un minuto.',
  EXPORTACION_VENCIDA: 'El enlace de descarga venció. Vuelve a exportar.',
  CONSULTA_DEMASIADO_COMPLEJA: 'La consulta pide demasiados datos a la vez. Filtra la lista e intenta de nuevo.',
  LIMITE_MENOR_QUE_USADO: 'El límite no puede quedar por debajo de lo reservado y utilizado.',
};

export const ERROR_GENERICO = 'No se pudo completar la operación. Intenta de nuevo.';
export const SIN_CONEXION = 'No se pudo hablar con el servidor. Revisa la conexión e intenta de nuevo.';

/** La frase de un código; uno que la pantalla no conoce sale con el texto genérico, nunca crudo. */
export const mensajeCodigo = (codigo?: string | null): string => (codigo && MENSAJES_ERROR[codigo]) || ERROR_GENERICO;
