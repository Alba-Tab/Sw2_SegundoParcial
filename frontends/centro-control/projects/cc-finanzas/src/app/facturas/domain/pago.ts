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
