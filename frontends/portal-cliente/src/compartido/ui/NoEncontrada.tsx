import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BotonEnlace } from './BotonEnlace';

/** Ruta desconocida (N4): lo dice y ofrece el inicio, en vez de redirigir en silencio. */
export function NoEncontrada() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', mt: 8, alignItems: 'flex-start' }}>
      <Typography variant="h5" component="h1">
        No encontramos esta página
      </Typography>
      <Typography>El enlace puede estar incompleto o la página ya no existe.</Typography>
      <BotonEnlace to="/" variant="contained" sx={{ minHeight: 44 }}>
        Ir al inicio
      </BotonEnlace>
    </Stack>
  );
}
