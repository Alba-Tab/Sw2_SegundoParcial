import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { ErrorApi } from '../../api/cliente';

/**
 * Lo que el cliente lee por cada `codigo` de 000 §5 (PRODUCT.md, "Tono"). Un solo lugar del portal; nunca el `detail`
 * del servicio ni el estado HTTP. Espejo de `ui-comun/dominio/src/errores.ts` del Centro de Control, en palabras del
 * cliente.
 */
const MENSAJES: Record<string, string> = {
  VALIDACION: 'Hay datos que no son válidos. Revisa el formulario.',
  NO_AUTENTICADO: 'Tu sesión terminó. Vuelve a ingresar.',
  SIN_PERMISO: 'No tienes permiso para ver esto.',
  NO_ENCONTRADO: 'No lo encontramos. Puede que el enlace esté mal o que ya no exista.',
  CONFLICTO_ESTADO: 'Esto cambió mientras lo mirabas. Actualiza la página y vuelve a intentar.',
  VERSION_DESACTUALIZADA: 'Estos datos cambiaron. Actualiza la página y vuelve a intentar.',
  IDEMPOTENCIA_EN_PROCESO: 'Tu pedido anterior todavía se está procesando. Espera unos segundos.',
  IDEMPOTENCIA_CUERPO_DISTINTO: 'Ese pedido ya se registró con otros datos.',
  COTIZACION_VENCIDA: 'La cotización venció. Pide una nueva.',
  COTIZACION_AJENA: 'Esa cotización no es de tu empresa.',
  CREDITO_INSUFICIENTE: 'Tu crédito disponible no alcanza para este servicio.',
  CREDITO_RECHAZADO: 'Administración no aprobó el crédito para este servicio.',
  SIN_UNIDAD_COMPATIBLE: 'No hay una unidad disponible para esa carga y esa fecha.',
  CLIENTE_NO_REPLICADO: 'Estamos terminando de preparar tu cuenta. Intenta de nuevo en unos segundos.',
  DEPENDENCIA_NO_DISPONIBLE: 'El servicio no responde. Intenta de nuevo en un momento.',
  ERROR_INTERNO: 'Ocurrió un error inesperado. Intenta de nuevo; si se repite, avísanos.',
  TONELAJE_EXCEDIDO: 'El máximo por servicio es 30 toneladas.',
  RUTA_SIN_TARIFA:
    'Esa ruta todavía no tiene precio para este tipo de carga. Elige otro tipo de carga u otra ruta, o llama a atención comercial.',
  APROBACION_VENCIDA: 'La aprobación de crédito no llegó a tiempo.',
  CONFIRMACION_EN_CURSO: 'Tu servicio todavía se está confirmando. Espera a que termine.',
  CANCELACION_NO_PERMITIDA: 'El viaje ya salió. Para cancelarlo, llama a atención comercial.',
  VINCULACION_PENDIENTE: 'Tu cuenta todavía se está vinculando. Intenta en unos minutos.',
  EVIDENCIA_INCOMPLETA: 'La prueba de entrega todavía se está subiendo. Vuelve a mirar en unos minutos.',
  LIMITE_PETICIONES: 'Hiciste muchas consultas seguidas. Espera un minuto.',
};

const ERROR_GENERICO = 'No se pudo completar. Intenta de nuevo.';
const SIN_CONEXION = 'Sin conexión con el servidor. Revisa tu señal e intenta de nuevo.';

export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorApi) return (error.codigo && MENSAJES[error.codigo]) || ERROR_GENERICO;
  if (error instanceof TypeError) return SIN_CONEXION;
  return ERROR_GENERICO;
}

/** Un error siempre con salida: "Reintentar" si la página puede volver a pedirlo (el "Volver" lo pone cada detalle). */
export function Problema({ error, reintentar }: { error: unknown; reintentar?: () => unknown }) {
  if (!error) return null;
  return (
    <Alert
      severity="error"
      action={
        reintentar && (
          <Button color="inherit" size="small" onClick={() => void reintentar()} sx={{ minHeight: 44 }}>
            Reintentar
          </Button>
        )
      }
    >
      {mensajeDe(error)}
    </Alert>
  );
}
