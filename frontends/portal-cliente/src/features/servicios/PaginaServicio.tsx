import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from '@tanstack/react-router';
import { type Servicio, useListarRutas, useObtenerServicio } from '../../api/generado/viajes';
import { dinero, fecha, instante, TIPOS_CARGA } from '../../compartido/formato/formato';
import { BotonEnlace } from '../../compartido/ui/BotonEnlace';
import { EstadoServicio } from '../../compartido/ui/EstadoServicio';
import { Problema } from '../../compartido/ui/Problema';
import { CancelarServicio } from './CancelarServicio';
import { Pod } from './Pod';
import { ETAPAS, MOTIVOS } from './textos';

const CON_POD = ['ENTREGADO', 'CERRADO', 'ENTREGA_OBSERVADA', 'ENTREGA_RECHAZADA'];

/** Cada 2 s mientras se confirma (spec 003, paso 5); cada 15 s en ruta para la última posición (spec 005). */
function intervalo(s?: Servicio): number | false {
  if (s?.estado === 'PROGRAMANDO') return 2000;
  if (s?.estado === 'EN_RUTA' || s?.estado === 'CONFIRMADO') return 15_000;
  return false;
}

export function PaginaServicio() {
  const { servicioId } = useParams({ from: '/servicios/$servicioId' });
  const servicio = useObtenerServicio(servicioId, { query: { refetchInterval: (q) => intervalo(q.state.data) } });
  const rutas = useListarRutas();

  if (servicio.isPending) return <CircularProgress aria-label="Cargando" />;
  if (servicio.isError) return <Problema error={servicio.error} />;
  const s = servicio.data;
  const ruta = rutas.data?.find((r) => r.rutaId === s.rutaId);

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 760 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="h5" component="h2">
            {ruta?.nombre ?? 'Servicio'}
          </Typography>
          <EstadoServicio estado={s.estado} etapa={s.etapa} />
        </Stack>
        <Typography color="text.secondary">
          {s.tipoCarga && TIPOS_CARGA[s.tipoCarga]} · {s.toneladas} t{s.fechaViaje && ` · ${fecha(s.fechaViaje)}`}
          {s.monto && ` · ${dinero(s.monto)}`}
        </Typography>

        {s.estado === 'PROGRAMANDO' && (
          <Stack spacing={1}>
            <Typography>{ETAPAS[s.etapa ?? 'DESCONOCIDA']}</Typography>
            {s.etapa !== 'ESPERANDO_APROBACION' && <LinearProgress />}
          </Stack>
        )}
        {s.estado === 'CANCELADO' && <Alert severity="info">{(s.motivo && MOTIVOS[s.motivo]) ?? 'El servicio se canceló.'}</Alert>}
        {s.estado === 'REQUIERE_INTERVENCION' && (
          <Alert severity="warning">Hubo un problema al confirmar y la empresa lo está revisando. Te avisaremos.</Alert>
        )}

        {s.placa && (
          <>
            <Divider />
            <Typography>
              Unidad <strong>{s.placa}</strong>
              {s.choferNombre && ` · Chofer ${s.choferNombre}`}
            </Typography>
          </>
        )}
        {s.iniciadoEn && <Typography color="text.secondary">Salió el {instante(s.iniciadoEn)}</Typography>}
        {s.estado === 'EN_RUTA' && s.ultimaPosicion && (
          <Typography>
            Última posición:{' '}
            <Link
              href={`https://www.openstreetmap.org/?mlat=${s.ultimaPosicion.lat}&mlon=${s.ultimaPosicion.lng}#map=12/${s.ultimaPosicion.lat}/${s.ultimaPosicion.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              {s.ultimaPosicion.lat.toFixed(4)}, {s.ultimaPosicion.lng.toFixed(4)}
            </Link>
          </Typography>
        )}
        {s.entregadoEn && <Typography color="text.secondary">Entregado el {instante(s.entregadoEn)}</Typography>}
        {s.numeroFactura && <Typography>Factura {s.numeroFactura}</Typography>}

        {(s.estado === 'PROGRAMANDO' || s.estado === 'CONFIRMADO') && <CancelarServicio servicioId={s.servicioId} />}
        {s.estado === 'EN_RUTA' && (
          <Typography variant="body2" color="text.secondary">
            El viaje ya salió; para cambios llama a atención comercial.
          </Typography>
        )}

        {CON_POD.includes(s.estado) && (
          <>
            <Divider />
            <Pod viajeId={s.viajeId} />
          </>
        )}
        <BotonEnlace to="/servicios" sx={{ alignSelf: 'flex-start' }}>
          Mis servicios
        </BotonEnlace>
      </Stack>
    </Paper>
  );
}
