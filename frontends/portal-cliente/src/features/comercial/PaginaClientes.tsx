import Button from '@mui/material/Button';
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
import { Cargando } from '../../compartido/ui/Cargando';
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
        {clientes.isPending && <Cargando filas={3} />}
        {clientes.isError && <Problema error={clientes.error} reintentar={clientes.refetch} />}
        {/* Siempre en el DOM: el lector anuncia cuando la búsqueda deja de encontrar (V5-3, WCAG 4.1.3). */}
        <Typography role="status" color="text.secondary" sx={{ '&:empty': { display: 'none' } }}>
          {clientes.data?.items.length === 0 &&
            (q
              ? `Ningún cliente coincide con «${q}». Puedes registrarlo sin cuenta.`
              : 'Todavía no hay clientes. Puedes registrar uno sin cuenta.')}
        </Typography>
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
