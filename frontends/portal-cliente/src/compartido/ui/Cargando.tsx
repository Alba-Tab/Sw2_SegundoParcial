import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

/** Carga de una lista o una ficha: líneas con la forma de lo que viene, no un círculo suelto. El lector oye "Cargando". */
export function Cargando({ filas = 4 }: { filas?: number }) {
  return (
    <Box role="status" aria-label="Cargando" sx={{ maxWidth: 720 }}>
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={24} width={['100%', '85%', '65%'][i % 3]} sx={{ my: 1.5 }} />
      ))}
    </Box>
  );
}
