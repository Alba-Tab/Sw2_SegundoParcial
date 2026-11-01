import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { conClave, ErrorApi } from '../../api/cliente';
import { cancelarServicio, getObtenerServicioQueryKey } from '../../api/generado/viajes';
import { CampoTexto } from '../../compartido/ui/CampoTexto';
import { mensajeDe } from '../../compartido/ui/Problema';
import { ERRORES_CANCELACION } from './textos';

/** Spec 004: el motivo va de 3 a 300 caracteres, sin contar los espacios de los bordes. */
const MotivoCancelacion = z.object({
  motivo: z.string().trim().min(3, 'Escribe al menos 3 caracteres.').max(300, 'Como máximo 300 caracteres.'),
});
type Datos = z.infer<typeof MotivoCancelacion>;

/**
 * Spec 004: cancelar antes de que el viaje salga, con el motivo del cliente. El diálogo es la confirmación: dice qué
 * pasa y el botón queda activo; si falta el motivo, lo marca y lo enfoca. Al cerrarse, el foco vuelve al botón.
 */
export function CancelarServicio({ servicioId, alCancelar }: { servicioId: string; alCancelar?: () => void }) {
  const consultas = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const { control, handleSubmit, reset } = useForm<Datos>({ resolver: zodResolver(MotivoCancelacion), defaultValues: { motivo: '' } });
  const cancelar = useMutation({
    mutationFn: (m: string) => cancelarServicio(servicioId, { motivo: m }, conClave(crypto.randomUUID())),
    onSuccess: (s) => {
      consultas.setQueryData(getObtenerServicioQueryKey(servicioId), s);
      setAbierto(false);
      alCancelar?.();
    },
  });
  const error = cancelar.error instanceof ErrorApi && cancelar.error.codigo ? ERRORES_CANCELACION[cancelar.error.codigo] : undefined;
  const cerrar = () => {
    setAbierto(false);
    reset();
    cancelar.reset();
  };

  return (
    <>
      <Button color="error" variant="outlined" onClick={() => setAbierto(true)} sx={{ alignSelf: 'flex-start' }}>
        Cancelar servicio
      </Button>
      <Dialog open={abierto} onClose={cerrar} fullWidth maxWidth="xs">
        <form onSubmit={handleSubmit((d) => cancelar.mutate(d.motivo))} noValidate>
          <DialogTitle>Cancelar el servicio</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 1 }}>
              Se cancela el servicio y se libera el crédito que tenía reservado. No se puede deshacer.
            </DialogContentText>
            <CampoTexto
              control={control}
              nombre="motivo"
              autoFocus
              fullWidth
              multiline
              minRows={2}
              margin="dense"
              label="Motivo"
              helperText="Obligatorio, de 3 a 300 caracteres"
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
            {cancelar.isError && <Alert severity="error">{error ?? mensajeDe(cancelar.error)}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={cerrar}>Volver</Button>
            <Button type="submit" color="error" variant="contained" loading={cancelar.isPending}>
              Cancelar servicio
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
