import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useDeferredValue, useState } from 'react';
import { useListarClientes } from '../../api/generado/viajes';
import { useClienteActivo } from '../../compartido/sesion/ClienteActivo';
import { Problema } from '../../compartido/ui/Problema';
import { FormularioEmpresa } from '../cuenta/FormularioEmpresa';

/** Modo comercial (spec 001, propuesta 7.6): elige a qué cliente atiende o registra uno sin cuenta. */
export function PaginaClientes() {
  const activo = useClienteActivo();
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const q = useDeferredValue(busqueda.trim());
  const clientes = useListarClientes(q ? { q } : undefined);
  const [registrando, setRegistrando] = useState(false);

  const elegir = (clienteId: string, razonSocial: string) => {
    activo.elegir({ clienteId, razonSocial });
    void navegar({ to: '/cotizar' });
  };

  if (registrando) {
    return (
      <Stack spacing={2}>
        <FormularioEmpresa titulo="Registrar un cliente sin cuenta" alCrear={(c) => elegir(c.clienteId, c.razonSocial)} />
        <Button onClick={() => setRegistrando(false)} sx={{ alignSelf: 'flex-start' }}>
          Volver a la lista
        </Button>
      </Stack>
    );
  }
  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 640 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h2">
          ¿A qué cliente atiendes?
        </Typography>
        <TextField label="Buscar por razón social o NIT" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        {clientes.isPending && <CircularProgress size={24} aria-label="Buscando" />}
        {clientes.isError && <Problema error={clientes.error} />}
        <List dense>
          {clientes.data?.items.map((c) => (
            <ListItemButton
              key={c.clienteId}
              selected={c.clienteId === activo.clienteId}
              onClick={() => elegir(c.clienteId, c.razonSocial)}
            >
              <ListItemText primary={c.razonSocial} secondary={`NIT ${c.nit}${c.tieneCuenta ? '' : ' · sin cuenta'}`} />
            </ListItemButton>
          ))}
        </List>
        <Button variant="outlined" onClick={() => setRegistrando(true)} sx={{ alignSelf: 'flex-start' }}>
          Registrar cliente sin cuenta
        </Button>
      </Stack>
    </Paper>
  );
}
