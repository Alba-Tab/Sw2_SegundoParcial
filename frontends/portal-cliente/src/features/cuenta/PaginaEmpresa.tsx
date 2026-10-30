import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { conClave, ErrorApi } from '../../api/cliente';
import {
  type Cliente,
  crearCliente,
  getObtenerMiClienteQueryKey,
  reintentarVinculacion,
  useObtenerMiCliente,
} from '../../api/generado/viajes';
import { CrearClienteBody } from '../../api/generado/viajes.zod';
import { marcarCampos } from '../../compartido/formato/errores';
import { useSesion } from '../../compartido/sesion/useSesion';
import { CampoTexto } from '../../compartido/ui/CampoTexto';
import { Problema } from '../../compartido/ui/Problema';

type DatosEmpresa = z.infer<typeof CrearClienteBody>;
const CAMPOS = ['razonSocial', 'nit', 'correo', 'telefono', 'direccion'] as const;

/**
 * Spec 001: el usuario nuevo completa los datos de su empresa; si Keycloak no vinculó, ofrece reintentar; ya vinculado,
 * renueva el token (trae clienteId y el rol cliente) y sigue a cotizar. Con la empresa lista, muestra sus datos.
 */
export function PaginaEmpresa() {
  const sesion = useSesion();
  const mio = useObtenerMiCliente({ query: { retry: false } });
  const sinEmpresa = mio.error instanceof ErrorApi && mio.error.estado === 404;

  if (mio.isPending) return <CircularProgress aria-label="Cargando" />;
  if (sinEmpresa) return <FormularioEmpresa />;
  if (mio.error) return <Problema error={mio.error} />;
  if (!mio.data.vinculado) return <Vinculacion />;
  if (sesion.necesitaEmpresa) return <Renovando />;
  return <DatosDeLaEmpresa cliente={mio.data} />;
}

function FormularioEmpresa() {
  const consultas = useQueryClient();
  const { control, handleSubmit, setError } = useForm<DatosEmpresa>({ resolver: zodResolver(CrearClienteBody), mode: 'onTouched' });
  const enviar = useMutation({
    // Una clave nueva por envío; si ya existe un cliente para este usuario, Viajes responde 409 y se relee.
    mutationFn: (datos: DatosEmpresa) => crearCliente(datos, conClave(crypto.randomUUID())),
    onSuccess: (cliente) => consultas.setQueryData(getObtenerMiClienteQueryKey(), cliente),
    onError: (e) => {
      if (e instanceof ErrorApi && e.estado === 409) void consultas.invalidateQueries({ queryKey: getObtenerMiClienteQueryKey() });
      else marcarCampos(e, setError, CAMPOS);
    },
  });

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <form onSubmit={handleSubmit((d) => enviar.mutate(d))} noValidate>
        <Stack spacing={2}>
          <Typography variant="h5" component="h2">
            Completa los datos de tu empresa
          </Typography>
          <Typography color="text.secondary">Con ellos emitimos tus facturas y te avisamos por correo.</Typography>
          <CampoTexto control={control} nombre="razonSocial" label="Razón social" required />
          <CampoTexto control={control} nombre="nit" label="NIT" required inputMode="numeric" />
          <CampoTexto control={control} nombre="correo" label="Correo de facturación" type="email" required />
          <CampoTexto control={control} nombre="telefono" label="Teléfono" required />
          <CampoTexto control={control} nombre="direccion" label="Dirección" required />
          {enviar.isError && !(enviar.error instanceof ErrorApi && enviar.error.estado === 400) && <Problema error={enviar.error} />}
          <Button type="submit" variant="contained" loading={enviar.isPending} sx={{ alignSelf: 'flex-start' }}>
            Guardar
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}

function Vinculacion() {
  const consultas = useQueryClient();
  const reintentar = useMutation({
    mutationFn: () => reintentarVinculacion(conClave(crypto.randomUUID())),
    onSuccess: (cliente) => consultas.setQueryData(getObtenerMiClienteQueryKey(), cliente),
  });
  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Alert severity="warning">Guardamos los datos de tu empresa, pero todavía no pudimos activar tu cuenta.</Alert>
      {reintentar.isError && <Problema error={reintentar.error} />}
      <Button variant="contained" onClick={() => reintentar.mutate()} loading={reintentar.isPending} sx={{ alignSelf: 'flex-start' }}>
        Reintentar vinculación
      </Button>
    </Stack>
  );
}

function Renovando() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const renovar = useMutation({ mutationFn: sesion.renovar, onSuccess: () => void navegar({ to: '/cotizar' }) });
  const { mutate } = renovar;
  useEffect(() => mutate(), [mutate]);
  if (renovar.isError) {
    return (
      <Stack spacing={2}>
        <Problema error={renovar.error} />
        <Button onClick={() => void sesion.iniciar()}>Volver a iniciar sesión</Button>
      </Stack>
    );
  }
  return <CircularProgress aria-label="Activando tu cuenta" />;
}

function DatosDeLaEmpresa({ cliente }: { cliente: Cliente }) {
  const filas: [string, string][] = [
    ['Razón social', cliente.razonSocial],
    ['NIT', cliente.nit],
    ['Correo de facturación', cliente.correo],
    ['Teléfono', cliente.telefono],
    ['Dirección', cliente.direccion],
  ];
  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Mi empresa
      </Typography>
      <Stack component="dl" spacing={1} sx={{ m: 0 }}>
        {filas.map(([t, v]) => (
          <div key={t}>
            <Typography component="dt" variant="caption" color="text.secondary">
              {t}
            </Typography>
            <Typography component="dd" sx={{ m: 0 }}>
              {v}
            </Typography>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}
