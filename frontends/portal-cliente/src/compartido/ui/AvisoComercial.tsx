import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Typography from '@mui/material/Typography';
import { useObtenerCliente } from '../../api/generado/viajes';
import { useClienteActivo } from '../sesion/ClienteActivo';
import { useSesion } from '../sesion/useSesion';
import { BotonEnlace } from './BotonEnlace';

/** Banda fija del modo comercial (propuesta 6.4 y 7.6, N7): a qué cliente se atiende, cómo cambiarlo y quién registra. */
export function AvisoComercial() {
  const sesion = useSesion();
  const activo = useClienteActivo();
  // Con "Ver como cliente" llega solo el id: se completa la razón social.
  const cliente = useObtenerCliente(activo.clienteId ?? '', { query: { enabled: !!activo.clienteId && !activo.razonSocial } });
  const esCelular = useMediaQuery((t: Theme) => t.breakpoints.down('sm'));
  if (!activo.modoComercial) return null;
  const nombre = activo.razonSocial ?? cliente.data?.razonSocial;
  return (
    <Alert
      severity="warning"
      variant="filled"
      square
      // En un celular la banda queda en una línea (V1-14, V3-9): sin ícono y el nombre cortado con «…»; el completo, en title.
      icon={esCelular ? false : undefined}
      sx={{ '& .MuiAlert-message': { minWidth: 0 } }}
      action={
        <BotonEnlace to="/clientes" color="inherit" variant="outlined" sx={{ minHeight: 44 }}>
          {activo.clienteId ? 'Cambiar cliente' : 'Elegir cliente'}
        </BotonEnlace>
      }
    >
      {activo.clienteId ? (
        // El lector de pantalla lee el texto entero: el corte es solo visual.
        <Box title={`Atendiendo a: ${nombre ?? ''}`} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Atendiendo a: <strong>{nombre ?? '…'}</strong>
        </Box>
      ) : (
        'Modo comercial: elige un cliente'
      )}
      {/* La nota de responsabilidad, desde sm. */}
      <Typography variant="body2" component="span" sx={{ display: { xs: 'none', sm: 'block' } }}>
        Lo que registres queda a nombre de {sesion.nombre}, por teléfono.
      </Typography>
    </Alert>
  );
}
