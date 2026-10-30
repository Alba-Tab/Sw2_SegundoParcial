import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { conClave, ErrorApi } from '../../api/cliente';
import { crearCotizacion, getObtenerCotizacionQueryKey } from '../../api/generado/finanzas';
import { CrearCotizacionBody } from '../../api/generado/finanzas.zod';
import { useListarRutas } from '../../api/generado/viajes';
import { marcarCampos } from '../../compartido/formato/errores';
import { diaDesdeHoy, TIPOS_CARGA } from '../../compartido/formato/formato';
import { CampoTexto } from '../../compartido/ui/CampoTexto';
import { Problema } from '../../compartido/ui/Problema';

/** El contrato más las reglas de la spec 002 que el portal puede avisar antes de enviar. */
const Formulario = CrearCotizacionBody.omit({ clienteId: true }).extend({
  toneladas: z.coerce.number<string>().gt(0, 'Debe ser mayor que 0').max(30, 'El máximo por servicio es 30 toneladas'),
  fechaViaje: z.iso
    .date()
    .refine((f) => f >= diaDesdeHoy(), 'Debe ser hoy o después')
    .refine((f) => f <= diaDesdeHoy(60), 'Como máximo 60 días adelante'),
});
type Entrada = z.input<typeof Formulario>;
type Datos = z.output<typeof Formulario>;
const CAMPOS = ['rutaId', 'tipoCarga', 'toneladas', 'fechaViaje'] as const;

const esperaReplicacion = (e: unknown) => e instanceof ErrorApi && e.estado === 503 && e.codigo === 'CLIENTE_NO_REPLICADO';

/** Spec 002: elige ruta, carga, toneladas y fecha; Finanzas responde la cotización VIGENTE por 24 h. */
export function PaginaCotizar() {
  const rutas = useListarRutas();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const { control, handleSubmit, setError } = useForm<Entrada, unknown, Datos>({
    resolver: zodResolver(Formulario),
    defaultValues: { rutaId: '', tipoCarga: 'GRANOS', toneladas: '', fechaViaje: diaDesdeHoy() },
  });
  const cotizar = useMutation({
    // La misma clave en los reintentos de este envío: si el primero llegó, Finanzas devuelve la misma cotización.
    mutationFn: ({ datos, clave }: { datos: Datos; clave: string }) => crearCotizacion(datos, conClave(clave)),
    // Un cliente recién registrado puede no estar todavía en Finanzas: 503 con Retry-After; se reintenta solo.
    retry: (n, e) => esperaReplicacion(e) && n < 10,
    retryDelay: (_n, e) => ((e instanceof ErrorApi && e.reintentarEnSegundos) || 2) * 1000,
    onSuccess: (c) => {
      consultas.setQueryData(getObtenerCotizacionQueryKey(c.cotizacionId), c);
      void navegar({ to: '/cotizaciones/$cotizacionId', params: { cotizacionId: c.cotizacionId } });
    },
    onError: (e) => marcarCampos(e, setError, CAMPOS),
  });

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <form onSubmit={handleSubmit((datos) => cotizar.mutate({ datos, clave: crypto.randomUUID() }))} noValidate>
        <Stack spacing={2}>
          <Typography variant="h5" component="h2">
            Cotizar un servicio
          </Typography>
          <CampoTexto control={control} nombre="rutaId" label="Ruta" select required disabled={!rutas.data}>
            {(rutas.data ?? []).map((r) => (
              <MenuItem key={r.rutaId} value={r.rutaId}>
                {r.nombre} · {r.distanciaKm} km
              </MenuItem>
            ))}
          </CampoTexto>
          {rutas.isError && <Problema error={rutas.error} />}
          <CampoTexto control={control} nombre="tipoCarga" label="Tipo de carga" select required>
            {Object.entries(TIPOS_CARGA).map(([valor, texto]) => (
              <MenuItem key={valor} value={valor}>
                {texto}
              </MenuItem>
            ))}
          </CampoTexto>
          <CampoTexto
            control={control}
            nombre="toneladas"
            label="Toneladas"
            type="number"
            required
            slotProps={{ htmlInput: { min: 0, max: 30, step: 0.5 } }}
          />
          <CampoTexto
            control={control}
            nombre="fechaViaje"
            label="Fecha del viaje"
            type="date"
            required
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: diaDesdeHoy(), max: diaDesdeHoy(60) } }}
          />
          {cotizar.isPending && cotizar.failureCount > 0 && <Typography color="text.secondary">Preparando tu cuenta…</Typography>}
          {cotizar.isError && !(cotizar.error instanceof ErrorApi && cotizar.error.estado === 400) && <Problema error={cotizar.error} />}
          <Button type="submit" variant="contained" loading={cotizar.isPending} sx={{ alignSelf: 'flex-start' }}>
            Cotizar
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
