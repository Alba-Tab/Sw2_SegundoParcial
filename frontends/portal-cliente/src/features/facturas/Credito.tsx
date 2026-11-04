import MoneyOff from '@mui/icons-material/MoneyOff';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useObtenerLineaCredito, useObtenerMiLineaCredito } from '../../api/generado/finanzas';
import { aCentavos, dinero, porcentaje } from '../../compartido/formato/formato';
import { Antiguedad } from '../../compartido/offline/Antiguedad';
import { useClienteActivo } from '../../compartido/sesion/ClienteActivo';
import { Cargando } from '../../compartido/ui/Cargando';
import { Problema } from '../../compartido/ui/Problema';

/** Spec 008: límite, disponible, reservado y utilizado. El cliente lee la suya; comercial, la del cliente que atiende. */
export function Credito() {
  const activo = useClienteActivo();
  const mia = useObtenerMiLineaCredito({ query: { enabled: !activo.modoComercial } });
  const deOtro = useObtenerLineaCredito(activo.clienteId ?? '', { query: { enabled: activo.modoComercial && !!activo.clienteId } });
  const linea = activo.modoComercial ? deOtro : mia;

  if (linea.isPending) return linea.fetchStatus === 'fetching' ? <Cargando filas={2} /> : null;
  if (!linea.data) return <Problema error={linea.error} reintentar={linea.refetch} />;
  const l = linea.data;
  const usado = porcentaje(aCentavos(l.utilizado.monto) + aCentavos(l.reservado.monto), aCentavos(l.limite.monto));
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" component="h2">
            Línea de crédito
          </Typography>
          {l.enMora && <Chip icon={<MoneyOff />} label="En mora" color="error" size="small" />}
        </Stack>
        <Antiguedad actualizadoEn={linea.dataUpdatedAt} fallo={linea.isError} />
        <Typography variant="h4" component="p">
          {dinero(l.disponible)}
          {/* En el teléfono, «disponible de …» va en su línea: no se corta entre la cifra y el límite. */}
          <Typography component="span" color="text.secondary" sx={{ display: { xs: 'block', sm: 'inline' } }}>
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
