import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { conClave, ErrorApi } from '../../api/cliente';
import { type Cliente, getObtenerMiClienteQueryKey, reintentarVinculacion, useObtenerMiCliente } from '../../api/generado/viajes';
import { useSesion } from '../../compartido/sesion/useSesion';
import { Problema } from '../../compartido/ui/Problema';
import { FormularioEmpresa } from './FormularioEmpresa';

/**
 * Spec 001: el usuario nuevo completa los datos de su empresa; si Keycloak no vinculó, ofrece reintentar; ya vinculado,
 * renueva el token (trae clienteId y el rol cliente) y sigue a cotizar. Con la empresa lista, muestra sus datos.
 */
export function PaginaEmpresa() {
  const sesion = useSesion();
  const consultas = useQueryClient();
  const mio = useObtenerMiCliente({ query: { retry: false } });
  const sinEmpresa = mio.error instanceof ErrorApi && mio.error.estado === 404;

  if (mio.isPending) return <CircularProgress aria-label="Cargando" />;
  if (sinEmpresa) {
    return (
      <FormularioEmpresa
        titulo="Completa los datos de tu empresa"
        alCrear={(c) => consultas.setQueryData(getObtenerMiClienteQueryKey(), c)}
        alExistir={() => void consultas.invalidateQueries({ queryKey: getObtenerMiClienteQueryKey() })}
      />
    );
  }
  if (mio.error) return <Problema error={mio.error} />;
  if (!mio.data.vinculado) return <Vinculacion />;
  if (sesion.necesitaEmpresa) return <Renovando />;
  return <DatosDeLaEmpresa cliente={mio.data} />;
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
