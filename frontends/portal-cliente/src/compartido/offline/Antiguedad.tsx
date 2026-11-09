import Alert from '@mui/material/Alert';
import { useEnLinea } from './useEnLinea';

export function haceCuanto(desde: number, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - desde) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Sin conexión (o si el servidor no respondió), avisa que los datos son de la caché y cuán viejos son. */
export function Antiguedad({ actualizadoEn, fallo }: { actualizadoEn: number; fallo?: boolean }) {
  const enLinea = useEnLinea();
  if ((enLinea && !fallo) || !actualizadoEn) return null;
  return (
    <Alert severity="info" variant="outlined">
      {enLinea ? 'No pudimos actualizar' : 'Sin conexión'}: datos guardados {haceCuanto(actualizadoEn)}.
    </Alert>
  );
}
