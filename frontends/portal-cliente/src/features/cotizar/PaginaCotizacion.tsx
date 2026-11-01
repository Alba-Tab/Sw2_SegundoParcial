import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useObtenerCotizacion } from '../../api/generado/finanzas';
import { useListarRutas } from '../../api/generado/viajes';
import { dinero, fecha, TIPOS_CARGA } from '../../compartido/formato/formato';
import { BotonEnlace } from '../../compartido/ui/BotonEnlace';
import { CuentaRegresiva } from '../../compartido/ui/CuentaRegresiva';
import { Problema } from '../../compartido/ui/Problema';
import { ConfirmarServicio } from '../servicios/ConfirmarServicio';
import { Cargando } from '../../compartido/ui/Cargando';

/** Spec 002, paso 6: el monto, la cuenta regresiva hasta venceEn y "Confirmar servicio" (spec 003). */
export function PaginaCotizacion() {
  const { cotizacionId } = useParams({ from: '/cotizaciones/$cotizacionId' });
  const cotizacion = useObtenerCotizacion(cotizacionId);
  const rutas = useListarRutas();
  const [vencioAqui, setVencioAqui] = useState(false);

  if (cotizacion.isPending) return conVolver(<Cargando filas={5} />);
  if (cotizacion.isError) return conVolver(<Problema error={cotizacion.error} reintentar={cotizacion.refetch} />);
  const c = cotizacion.data;
  const ruta = rutas.data?.find((r) => r.rutaId === c.rutaId);
  const vencida = c.vencida || vencioAqui;

  return conVolver(
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          Tu cotización
        </Typography>
        <Typography color="text.secondary">
          {ruta?.nombre ?? 'Ruta: Sin dato'} · {TIPOS_CARGA[c.tipoCarga]} · {c.toneladas} t · {fecha(c.fechaViaje)}
        </Typography>
        <Divider />
        <Typography variant="h3" component="p">
          {dinero(c.monto)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Tarifa: {dinero(c.tarifaPorTonelada)} por tonelada
        </Typography>
        {c.estado === 'ACEPTADA' ? (
          // Sin callejón: el servicio que salió de esta cotización está en la lista.
          <Alert
            severity="info"
            action={
              <BotonEnlace to="/servicios" color="inherit" size="small" sx={{ minHeight: 44 }}>
                Ver servicios
              </BotonEnlace>
            }
          >
            Ya confirmaste esta cotización.
          </Alert>
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
    </Paper>,
  );
}

/** "Volver" al formulario de cotizar arriba de todo, también mientras carga o si falla (N1). */
function conVolver(contenido: ReactNode) {
  return (
    <Stack spacing={2}>
      <BotonEnlace to="/cotizar" startIcon={<ArrowBack />} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        Volver a cotizar
      </BotonEnlace>
      {contenido}
    </Stack>
  );
}
