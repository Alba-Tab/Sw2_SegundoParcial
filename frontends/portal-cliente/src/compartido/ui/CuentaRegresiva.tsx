import Typography, { type TypographyProps } from '@mui/material/Typography';
import { useEffect, useState } from 'react';

export function restante(hasta: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.floor((Date.parse(hasta) - ahora) / 1000));
  const [h, m, seg] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(seg).padStart(2, '0')}`;
}

/** Cuánto falta para `hasta`; avisa una vez al llegar a cero. */
export function CuentaRegresiva({ hasta, alVencer, ...props }: { hasta: string; alVencer?: () => void } & TypographyProps) {
  const [ahora, setAhora] = useState(() => Date.now());
  const vencida = ahora >= Date.parse(hasta);
  useEffect(() => {
    if (vencida) {
      alVencer?.();
      return;
    }
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [vencida, alVencer]);
  return (
    <Typography role="timer" aria-live="off" {...props}>
      {vencida ? 'Vencida' : `Vence en ${restante(hasta, ahora)}`}
    </Typography>
  );
}
