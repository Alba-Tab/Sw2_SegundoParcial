import { aCentavos, desdeCentavos } from 'ui-comun/dominio';
import type { MedioPago } from '../../graphql/generado';

/** El pago que administración está cargando (spec 008); el monto va como texto con 2 decimales, nunca en float. */
export interface PagoEnEdicion {
  monto: string;
  fecha: string;
  medio: MedioPago;
  referencia: string;
}

export const MEDIOS_PAGO: MedioPago[] = ['TRANSFERENCIA', 'DEPOSITO', 'EFECTIVO', 'CHEQUE'];

/** El saldo que queda si se registra ese monto (para el resumen de la confirmación); en centavos, sin float. */
export const saldoDespuesDe = (saldo: string, monto: string): string => desdeCentavos((aCentavos(saldo) ?? 0n) - (aCentavos(monto) ?? 0n));

/**
 * El pago con el que choca un `PAGO_DUPLICADO` (spec 008, "muestra el pago existente"): por el `pagoId` del error si
 * llega; si no (el Gateway hoy no reenvía esa extensión), por medio y referencia, que es lo que el índice único compara.
 */
export function pagoRepetido<P extends { pagoId: string; medio: string; referencia: string }>(
  pagos: readonly P[],
  pagoId: unknown,
  medio: string,
  referencia: string,
): P | undefined {
  if (typeof pagoId === 'string') {
    const exacto = pagos.find((p) => p.pagoId === pagoId);
    if (exacto) return exacto;
  }
  return pagos.find((p) => p.medio === medio && p.referencia.trim() === referencia.trim());
}

/** El saldo de un `PAGO_EXCEDE_SALDO`: el de la extensión `saldo` del error si es un monto válido; si no, el de pantalla. */
export function saldoDelError(extension: unknown, dePantalla: string | undefined): string | undefined {
  const monto = (extension as { monto?: unknown } | null | undefined)?.monto;
  return typeof monto === 'string' && aCentavos(monto) !== null ? monto : dePantalla;
}
