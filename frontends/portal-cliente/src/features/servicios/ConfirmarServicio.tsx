import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { conClave } from '../../api/cliente';
import { crearServicio, getListarServiciosQueryKey } from '../../api/generado/viajes';
import { useClienteActivo } from '../../compartido/sesion/ClienteActivo';
import { Problema } from '../../compartido/ui/Problema';

/**
 * Spec 003, paso 1: `POST /servicios` con una clave por intento. Un doble clic o un reintento por falta de red reusan
 * la clave del intento, así Viajes devuelve el mismo servicio (FS7); confirmar otra vez es otro intento.
 */
export function ConfirmarServicio({ cotizacionId, deshabilitado }: { cotizacionId: string; deshabilitado?: boolean }) {
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const activo = useClienteActivo();
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const confirmar = useMutation({
    mutationFn: () =>
      crearServicio(activo.modoComercial ? { cotizacionId, clienteId: activo.clienteId } : { cotizacionId }, conClave(clave)),
    retry: (n, e) => e instanceof TypeError && n < 2,
    onSuccess: (s) => {
      void consultas.invalidateQueries({ queryKey: getListarServiciosQueryKey() });
      void navegar({ to: '/servicios/$servicioId', params: { servicioId: s.servicioId } });
    },
    onError: (e) => {
      if (!(e instanceof TypeError)) setClave(crypto.randomUUID());
    },
  });
  return (
    <Stack spacing={1}>
      {confirmar.isError && <Problema error={confirmar.error} />}
      <Button
        variant="contained"
        size="large"
        disabled={deshabilitado}
        loading={confirmar.isPending}
        onClick={() => confirmar.mutate()}
        sx={{ alignSelf: 'flex-start' }}
      >
        Confirmar servicio
      </Button>
    </Stack>
  );
}
