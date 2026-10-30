import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { conClave, ErrorApi } from '../../api/cliente';
import { cancelarServicio, getObtenerServicioQueryKey } from '../../api/generado/viajes';
import { mensajeDe } from '../../compartido/ui/Problema';
import { ERRORES_CANCELACION } from './textos';

/** Spec 004: cancelar antes de que el viaje salga, con el motivo del cliente. */
export function CancelarServicio({ servicioId }: { servicioId: string }) {
  const consultas = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelar = useMutation({
    mutationFn: (m: string) => cancelarServicio(servicioId, { motivo: m }, conClave(crypto.randomUUID())),
    onSuccess: (s) => {
      consultas.setQueryData(getObtenerServicioQueryKey(servicioId), s);
      setAbierto(false);
    },
  });
  const error = cancelar.error instanceof ErrorApi && cancelar.error.codigo ? ERRORES_CANCELACION[cancelar.error.codigo] : undefined;
  const valido = motivo.trim().length >= 3;

  return (
    <>
      <Button color="error" variant="outlined" onClick={() => setAbierto(true)} sx={{ alignSelf: 'flex-start' }}>
        Cancelar servicio
      </Button>
      <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="xs">
        <DialogTitle>Cancelar el servicio</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            margin="dense"
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />
          {cancelar.isError && <Alert severity="error">{error ?? mensajeDe(cancelar.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAbierto(false)}>Volver</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!valido}
            loading={cancelar.isPending}
            onClick={() => cancelar.mutate(motivo.trim())}
          >
            Cancelar servicio
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
