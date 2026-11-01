import Logout from '@mui/icons-material/Logout';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { limpiarCache } from '../offline/cache';
import { useSesion } from '../sesion/useSesion';

/** Una cuenta interna entró al portal: se lo dice y le da la salida, en vez de pedirle crear una empresa. */
export function CuentaInterna() {
  const s = useSesion();
  const consultas = useQueryClient();
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', mt: 8, alignItems: 'flex-start' }}>
      <Typography variant="h5" component="h2">
        Esta cuenta es del Centro de Control
      </Typography>
      <Typography>
        Entraste como {s.nombre}. El portal es para los clientes; para usarlo, cierra sesión y entra con la cuenta de una empresa cliente.
      </Typography>
      <Button
        variant="contained"
        startIcon={<Logout />}
        sx={{ minHeight: 44 }}
        onClick={() => {
          limpiarCache(consultas);
          void s.cerrar();
        }}
      >
        Cerrar sesión
      </Button>
    </Stack>
  );
}
