import { fechaLaPaz } from 'ui-comun';
import type { MedioPago } from '../../graphql/generado';

/** El pago que administración está cargando (spec 008); el monto va como texto con 2 decimales, nunca en float. */
export interface PagoEnEdicion {
  monto: string;
  fecha: string;
  medio: MedioPago;
  referencia: string;
}

export const MEDIOS_PAGO: MedioPago[] = ['TRANSFERENCIA', 'DEPOSITO', 'EFECTIVO', 'CHEQUE'];

export const pagoNuevo = (): PagoEnEdicion => ({ monto: '', fecha: fechaLaPaz(), medio: 'TRANSFERENCIA', referencia: '' });

/** Monto con 2 decimales y referencia escrita; los demás límites los decide Finanzas. */
export const pagoValido = (p: PagoEnEdicion): boolean => /^(0|[1-9]\d{0,11})\.\d{2}$/.test(p.monto) && p.referencia.trim().length > 0;
