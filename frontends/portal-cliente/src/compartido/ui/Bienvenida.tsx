import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useSesion } from '../sesion/useSesion';

export function Bienvenida() {
  const s = useSesion();
  // Antes de redirigir, oidc-client-ts lee la configuración de Keycloak; si no responde, se avisa en vez de quedar esperando.
  const ir = useMutation({ mutationFn: (destino: 'iniciar' | 'crearCuenta') => s[destino]() });
  const error = ir.error ?? s.error;
  return (
    <Paper variant="outlined" sx={{ p: 4, maxWidth: 520, mx: 'auto', mt: 6 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h2">
          Transporte de carga por carretera
        </Typography>
        <Typography color="text.secondary">Cotiza, confirma y sigue tus servicios; revisa tus facturas y tu crédito.</Typography>
        {error && <Alert severity="error">No pudimos contactar al servicio de inicio de sesión. Intenta de nuevo en un momento.</Alert>}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => ir.mutate('iniciar')} loading={ir.isPending && ir.variables === 'iniciar'}>
            Iniciar sesión
          </Button>
          <Button variant="outlined" onClick={() => ir.mutate('crearCuenta')} loading={ir.isPending && ir.variables === 'crearCuenta'}>
            Crear cuenta
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
