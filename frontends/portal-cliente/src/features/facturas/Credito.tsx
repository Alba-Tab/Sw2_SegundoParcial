import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useObtenerLineaCredito, useObtenerMiLineaCredito } from '../../api/generado/finanzas';
import { dinero } from '../../compartido/formato/formato';
import { Antiguedad } from '../../compartido/offline/Antiguedad';
import { useClienteActivo } from '../../compartido/sesion/ClienteActivo';
import { Problema } from '../../compartido/ui/Problema';

/** Spec 008: límite, disponible, reservado y utilizado. El cliente lee la suya; comercial, la del cliente que atiende. */
export function Credito() {
  const activo = useClienteActivo();
  const mia = useObtenerMiLineaCredito({ query: { enabled: !activo.modoComercial } });
  const deOtro = useObtenerLineaCredito(activo.clienteId ?? '', { query: { enabled: activo.modoComercial && !!activo.clienteId } });
  const linea = activo.modoComercial ? deOtro : mia;

  if (linea.isPending) return null;
  if (!linea.data) return <Problema error={linea.error} />;
  const l = linea.data;
  const usado = Number(l.limite.monto) > 0 ? ((Number(l.utilizado.monto) + Number(l.reservado.monto)) / Number(l.limite.monto)) * 100 : 0;
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" component="h3">
            Línea de crédito
          </Typography>
          {l.enMora && <Chip label="En mora" color="error" size="small" />}
        </Stack>
        <Antiguedad actualizadoEn={linea.dataUpdatedAt} fallo={linea.isError} />
        <Typography variant="h4" component="p">
          {dinero(l.disponible)}
          <Typography component="span" color="text.secondary">
            {' '}
            disponible de {dinero(l.limite)}
          </Typography>
        </Typography>
        <LinearProgress variant="determinate" value={Math.min(100, usado)} aria-label="Crédito usado" />
        <Typography variant="body2" color="text.secondary">
          Utilizado {dinero(l.utilizado)} · Reservado por servicios en curso {dinero(l.reservado)}
        </Typography>
      </Stack>
    </Paper>
  );
}
