import ArrowBack from '@mui/icons-material/ArrowBack';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type Servicio, useListarRutas, useObtenerServicio } from '../../api/generado/viajes';
import { dinero, fecha, instante, TIPOS_CARGA } from '../../compartido/formato/formato';
import { BotonEnlace } from '../../compartido/ui/BotonEnlace';
import { Enlace } from '../../compartido/ui/Enlace';
import { EstadoServicio } from '../../compartido/ui/EstadoServicio';
import { Problema } from '../../compartido/ui/Problema';
import { CancelarServicio } from './CancelarServicio';
import { Pod } from './Pod';
import { ETAPAS, MOTIVOS } from './textos';
import { Cargando } from '../../compartido/ui/Cargando';

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
  // Tras cancelar aquí, el resultado queda en la página (no solo se cierra el diálogo) y recibe el foco (N6).
  const [recienCancelado, setRecienCancelado] = useState(false);
  const alertaRef = useRef<HTMLDivElement>(null);
  const cancelado = servicio.data?.estado === 'CANCELADO';
  // Una sola vez: un ref en línea se vuelve a llamar en cada render y robaría el foco (B-2).
  useEffect(() => {
    if (recienCancelado && cancelado) alertaRef.current?.focus();
  }, [recienCancelado, cancelado]);

  if (servicio.isPending) return conVolver(<Cargando filas={6} />);
  if (servicio.isError) return conVolver(<Problema error={servicio.error} reintentar={servicio.refetch} />);
  const s = servicio.data;
  const ruta = rutas.data?.find((r) => r.rutaId === s.rutaId);

  return conVolver(
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 760 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="h5" component="h2">
            {ruta?.nombre ?? 'Servicio'}
          </Typography>
          <EstadoServicio estado={s.estado} etapa={s.etapa} />
        </Stack>
        {/* Solo lo que llegó: sin «undefined t» ni separadores sueltos. */}
        <Typography color="text.secondary">
          {[
            s.tipoCarga && TIPOS_CARGA[s.tipoCarga],
            s.toneladas && `${s.toneladas} t`,
            s.fechaViaje && fecha(s.fechaViaje),
            s.monto && dinero(s.monto),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>

        {s.estado === 'PROGRAMANDO' && (
          <Stack spacing={1}>
            <Typography>{ETAPAS[s.etapa ?? 'DESCONOCIDA']}</Typography>
            {s.etapa !== 'ESPERANDO_APROBACION' && <LinearProgress />}
          </Stack>
        )}
        {s.estado === 'CANCELADO' && (
          <Alert
            severity={recienCancelado ? 'success' : 'info'}
            role={recienCancelado ? 'status' : undefined}
            tabIndex={recienCancelado ? -1 : undefined}
            ref={alertaRef}
          >
            {(s.motivo && MOTIVOS[s.motivo]) ?? 'El servicio se canceló.'}
          </Alert>
        )}
        {s.estado === 'REQUIERE_INTERVENCION' && (
          // El chip ya dice qué pasa; aquí, lo que agrega: en espera, sin nada que hacer (V3-8).
          <Alert severity="info">
            La empresa está resolviendo un imprevisto. Te avisaremos por correo cuando se resuelva; no tienes que hacer nada.
          </Alert>
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
              <OpenInNew fontSize="inherit" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
              {/* Como «Ver como cliente» del Centro de Control: avisa que se abre en otra pestaña (V5-6). */}
              <Box component="span" sx={OCULTO}>
                (se abre en otra pestaña)
              </Box>
            </Link>
          </Typography>
        )}
        {s.entregadoEn && <Typography color="text.secondary">Entregado el {instante(s.entregadoEn)}</Typography>}
        {s.numeroFactura && (
          <Typography>
            {s.facturaId ? (
              <Enlace to="/facturas/$facturaId" params={{ facturaId: s.facturaId }}>
                Factura {s.numeroFactura}
              </Enlace>
            ) : (
              `Factura ${s.numeroFactura}`
            )}
          </Typography>
        )}

        {(s.estado === 'PROGRAMANDO' || s.estado === 'CONFIRMADO') && (
          <CancelarServicio servicioId={s.servicioId} alCancelar={() => setRecienCancelado(true)} />
        )}
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
      </Stack>
    </Paper>,
  );
}

/** "Volver" a la lista arriba de todo, también mientras carga o si falla (N1). */
function conVolver(contenido: ReactNode) {
  return (
    <Stack spacing={2}>
      <BotonEnlace to="/servicios" startIcon={<ArrowBack />} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        Volver a servicios
      </BotonEnlace>
      {contenido}
    </Stack>
  );
}

/** Solo para el lector de pantalla (el mismo recorte que `cdk-visually-hidden`). */
const OCULTO = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;
