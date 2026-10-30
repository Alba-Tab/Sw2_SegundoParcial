import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { conClave, ErrorApi } from '../../api/cliente';
import { type Cliente, crearCliente } from '../../api/generado/viajes';
import { CrearClienteBody } from '../../api/generado/viajes.zod';
import { marcarCampos } from '../../compartido/formato/errores';
import { CampoTexto } from '../../compartido/ui/CampoTexto';
import { Problema } from '../../compartido/ui/Problema';

type DatosEmpresa = z.infer<typeof CrearClienteBody>;
const CAMPOS = ['razonSocial', 'nit', 'correo', 'telefono', 'direccion'] as const;

/**
 * Spec 001: POST /clientes con react-hook-form y el zod del contrato; los `errores[]` de un 400 quedan bajo cada campo.
 * Lo usa el cliente nuevo (con cuenta) y atención comercial (cliente sin cuenta, canal TELEFONO).
 */
export function FormularioEmpresa({
  titulo,
  alCrear,
  alExistir,
}: {
  titulo: string;
  alCrear: (c: Cliente) => void;
  /** 409: el usuario ya tiene cliente o el NIT ya existe. */
  alExistir?: () => void;
}) {
  const { control, handleSubmit, setError } = useForm<DatosEmpresa>({ resolver: zodResolver(CrearClienteBody), mode: 'onTouched' });
  const enviar = useMutation({
    // Una clave nueva por envío; si ya existe, Viajes responde 409.
    mutationFn: (datos: DatosEmpresa) => crearCliente(datos, conClave(crypto.randomUUID())),
    onSuccess: alCrear,
    onError: (e) => {
      if (e instanceof ErrorApi && e.estado === 409) alExistir?.();
      else marcarCampos(e, setError, CAMPOS);
    },
  });

  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
      <form onSubmit={handleSubmit((d) => enviar.mutate(d))} noValidate>
        <Stack spacing={2}>
          <Typography variant="h5" component="h2">
            {titulo}
          </Typography>
          <Typography color="text.secondary">Con estos datos se emiten las facturas y se envían los avisos por correo.</Typography>
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
