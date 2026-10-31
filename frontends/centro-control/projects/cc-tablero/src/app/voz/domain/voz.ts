import type { PreguntarMutation, ReporteId } from '../../graphql/generado';

export type Respuesta = PreguntarMutation['preguntar'];

/** FR4: sin LLM o con una pregunta fuera del catálogo quedan estos 5 reportes como botones. */
export const REPORTES_CATALOGO: { id: ReporteId; titulo: string }[] = [
  { id: 'CUENTAS_POR_COBRAR', titulo: 'Cuentas por cobrar' },
  { id: 'VIAJES_EN_RIESGO', titulo: 'Viajes en riesgo' },
  { id: 'FACTURACION_POR_CLIENTE', titulo: 'Facturación por cliente' },
  { id: 'CONSUMO_COMBUSTIBLE', titulo: 'Consumo de combustible' },
  { id: 'RENTABILIDAD', titulo: 'Rentabilidad' },
];

/** La pregunta va con 3 caracteres o más (D95: el texto se puede corregir antes). */
export const preguntaValida = (texto: string): boolean => texto.trim().length >= 3;

/** El mensaje según el `codigo` del error (000 §5); la pantalla decide por el código, no por el texto. */
export function mensajePregunta(codigo: string | undefined, mensaje: string): string {
  if (codigo === 'LLM_NO_DISPONIBLE') return 'El asistente no está disponible';
  if (codigo === 'PREGUNTA_FUERA_DE_ALCANCE') return 'Puedo responder sobre estos 5 reportes';
  if (codigo === 'SIN_PERMISO') return 'No tienes permiso para ese reporte';
  return mensaje;
}

/** Con el LLM caído o una pregunta fuera del catálogo se muestran los botones de los 5 reportes. */
export const mostrarCatalogo = (codigo: string | undefined): boolean =>
  codigo === 'LLM_NO_DISPONIBLE' || codigo === 'PREGUNTA_FUERA_DE_ALCANCE';
