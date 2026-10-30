import Alert from '@mui/material/Alert';
import { useObtenerCliente } from '../../api/generado/viajes';
import { useClienteActivo } from '../sesion/ClienteActivo';
import { useSesion } from '../sesion/useSesion';
import { BotonEnlace } from './BotonEnlace';

/** Aviso fijo del modo comercial (propuesta 6.4 y 7.6): a qué cliente se atiende y quién registra. */
export function AvisoComercial() {
  const sesion = useSesion();
  const activo = useClienteActivo();
  // Con "Ver como cliente" llega solo el id: se completa la razón social.
  const cliente = useObtenerCliente(activo.clienteId ?? '', { query: { enabled: !!activo.clienteId && !activo.razonSocial } });
  if (!activo.modoComercial) return null;
  const nombre = activo.razonSocial ?? cliente.data?.razonSocial;
  return (
    <Alert
      severity="warning"
      variant="filled"
      square
      sx={{ position: 'sticky', top: 64, zIndex: (t) => t.zIndex.appBar - 1 }}
      action={
        <BotonEnlace to="/clientes" color="inherit" size="small">
          {activo.clienteId ? 'Cambiar cliente' : 'Elegir cliente'}
        </BotonEnlace>
      }
    >
      Modo comercial ·{' '}
      {activo.clienteId ? (
        <>
          Atiendes a <strong>{nombre ?? '…'}</strong>
        </>
      ) : (
        'Elige un cliente'
      )}{' '}
      · Lo que registres queda a nombre de {sesion.nombre}, por teléfono.
    </Alert>
  );
}
