import Alert from '@mui/material/Alert';
import { ErrorApi } from '../../api/cliente';

/** Mensajes de los códigos de 000 §5 que el cliente puede ver; el resto muestra el `detail` del servicio. */
const MENSAJES: Record<string, string> = {
  SIN_PERMISO: 'No tienes permiso para ver esto.',
  NO_ENCONTRADO: 'No lo encontramos.',
  DEPENDENCIA_NO_DISPONIBLE: 'El servicio no responde. Intenta de nuevo en un momento.',
  ERROR_INTERNO: 'Ocurrió un error inesperado. Intenta de nuevo; si se repite, avísanos.',
  CLIENTE_NO_REPLICADO: 'Estamos terminando de preparar tu cuenta. Intenta de nuevo en unos segundos.',
  TONELAJE_EXCEDIDO: 'El máximo por servicio es 30 toneladas.',
};

export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorApi) return (error.codigo && MENSAJES[error.codigo]) || error.problema?.detail || `Error ${error.estado}`;
  if (error instanceof TypeError) return 'Sin conexión con el servidor.';
  return 'Ocurrió un error inesperado.';
}

export function Problema({ error }: { error: unknown }) {
  if (!error) return null;
  return <Alert severity="error">{mensajeDe(error)}</Alert>;
}
