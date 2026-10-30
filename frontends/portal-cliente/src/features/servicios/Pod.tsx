import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueries } from '@tanstack/react-query';
import { getObtenerEvidenciaQueryOptions, useObtenerEntrega } from '../../api/generado/viajes';
import { instante } from '../../compartido/formato/formato';
import { Problema } from '../../compartido/ui/Problema';

/** La URL firmada vence a los 5 min: se pide de nuevo antes. */
const VIDA_URL_MS = 4 * 60_000;

/** Prueba de entrega (spec 006): receptor, hora, fotos y firma con URL firmadas de S3. */
export function Pod({ viajeId }: { viajeId: string }) {
  const entrega = useObtenerEntrega(viajeId);
  const ids = entrega.data ? [...entrega.data.fotos, ...(entrega.data.firmaEvidenciaId ? [entrega.data.firmaEvidenciaId] : [])] : [];
  const evidencias = useQueries({
    queries: ids.map((id) => ({ ...getObtenerEvidenciaQueryOptions(viajeId, id), staleTime: VIDA_URL_MS, refetchInterval: VIDA_URL_MS })),
  });

  if (entrega.isPending) return <CircularProgress size={24} aria-label="Cargando la entrega" />;
  if (entrega.isError) return <Problema error={entrega.error} />;
  const e = entrega.data;
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h3">
        {e.tipo === 'ENTREGA' ? 'Prueba de entrega' : 'Rechazo en destino'}
      </Typography>
      <Typography color="text.secondary">
        {instante(e.registradaEn)}
        {e.nombreReceptor && ` · Recibió ${e.nombreReceptor}`}
      </Typography>
      {e.motivo && <Alert severity="warning">{e.motivo}</Alert>}
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        {evidencias.map((q, i) =>
          q.data?.url ? (
            <Box
              key={ids[i]}
              component="img"
              src={q.data.url}
              alt={q.data.tipo === 'FIRMA' ? 'Firma del receptor' : `Foto de la entrega ${i + 1}`}
              sx={{
                width: 220,
                height: 160,
                objectFit: 'cover',
                borderRadius: 2,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
              }}
            />
          ) : (
            <Box
              key={ids[i]}
              sx={{ width: 220, height: 160, display: 'grid', placeItems: 'center', borderRadius: 2, border: 1, borderColor: 'divider' }}
            >
              {q.isError ? <Typography variant="caption">No disponible</Typography> : <CircularProgress size={20} />}
            </Box>
          ),
        )}
      </Stack>
    </Stack>
  );
}
