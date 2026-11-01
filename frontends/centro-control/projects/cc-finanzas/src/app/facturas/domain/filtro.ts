/** Con saldo, una factura pagada no puede salir: el filtro de estado solo ofrece estos (C-9). */
export const ESTADOS_CON_SALDO = ['EMITIDA', 'PAGADA_PARCIAL'];

/** Lo que cambia en la URL al pasar entre "Con saldo" y "Todas": un estado que ya no se ofrece se limpia (V1-8). */
export function cambioDeSaldo(valor: string, estado: string | null | undefined): { saldo: string | null; estado?: null } {
  if (valor === 'todas') return { saldo: 'todas' };
  return estado && !ESTADOS_CON_SALDO.includes(estado) ? { saldo: null, estado: null } : { saldo: null };
}
