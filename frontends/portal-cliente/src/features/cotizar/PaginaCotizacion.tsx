import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { useObtenerCotizacion } from '../../api/generado/finanzas';
import { useListarRutas } from '../../api/generado/viajes';
import { dinero, fecha, TIPOS_CARGA } from '../../compartido/formato/formato';
import { BotonEnlace } from '../../compartido/ui/BotonEnlace';
import { CuentaRegresiva } from '../../compartido/ui/CuentaRegresiva';
import { Problema } from '../../compartido/ui/Problema';
import { ConfirmarServicio } from '../servicios/ConfirmarServicio';

/** Spec 002, paso 6: el monto, la cuenta regresiva hasta venceEn y "Confirmar servicio" (spec 003). */
export function PaginaCotizacion() {
  const { cotizacionId } = useParams({ from: '/cotizaciones/$cotizacionId' });
  const cotizacion = useObtenerCotizacion(cotizacionId);
  const rutas = useListarRutas();
  const [vencioAqui, setVencioAqui] = useState(false);

  if (cotizacion.isPending) return <CircularProgress aria-label="Cargando" />;
  if (cotizacion.isError) return <Problema error={cotizacion.error} />;
  const c = cotizacion.data;
  const ruta = rutas.data?.find((r) => r.rutaId === c.rutaId);
  const vencida = c.vencida || vencioAqui;

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h2">
          Tu cotización
        </Typography>
        <Typography color="text.secondary">
          {ruta?.nombre ?? 'Ruta'} · {TIPOS_CARGA[c.tipoCarga]} · {c.toneladas} t · {fecha(c.fechaViaje)}
        </Typography>
        <Divider />
        <Typography variant="h3" component="p">
          {dinero(c.monto)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Tarifa: {dinero(c.tarifaPorTonelada)} por tonelada
        </Typography>
        {c.estado === 'ACEPTADA' ? (
          <Alert severity="info">Ya confirmaste esta cotización.</Alert>
        ) : vencida ? (
          <Alert severity="warning">La cotización venció. Pide una nueva para ver el precio de hoy.</Alert>
        ) : (
          <CuentaRegresiva hasta={c.venceEn} alVencer={() => setVencioAqui(true)} color="text.secondary" />
        )}
        {c.estado === 'VIGENTE' && !vencida && <ConfirmarServicio cotizacionId={c.cotizacionId} />}
        <Stack direction="row" spacing={1}>
          <BotonEnlace to="/cotizar" variant={vencida ? 'contained' : 'text'}>
            Nueva cotización
          </BotonEnlace>
        </Stack>
      </Stack>
    </Paper>
  );
}
