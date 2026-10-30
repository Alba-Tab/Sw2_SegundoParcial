import { ErrorDeDominio } from '../comun/error-de-dominio';
import { Monto } from '../comun/monto';
import type { Unidad } from '../unidad/unidad';

/** Carga de combustible registrada por el chofer (spec 009). No tiene estados. */
export interface CargaCombustible {
  cargaId: string;
  opId: string;
  viajeId: string;
  tractoId: string;
  placa: string;
  choferId: string;
  litros: number;
  monto: { monto: string; moneda: 'BOB' };
  kilometraje: number;
  registradaEn: string;
  posicion?: { lat: number; lng: number };
  fotoReciboEvidenciaId?: string;
}

const DESFASE_DE_RELOJ_MS = 2 * 60_000;

/**
 * Reglas de la spec 009: litros dentro del tanque (CARGA_EXCEDE_TANQUE), monto > 0 (VALIDACION) y odómetro que no baja
 * (KILOMETRAJE_INVALIDO). Una carga exagerada que cabe en el tanque no se rechaza: la marca Analítica (FF2).
 */
export function validarCarga(
  tracto: Unidad,
  e: { litros: number; monto: { monto: string; moneda: string }; kilometraje: number; registradaEn: string },
  ahora: Date,
): void {
  const monto = Monto.desdeContrato(e.monto);
  if (!monto.esPositivo()) throw new ErrorDeDominio('VALIDACION', 'monto: debe ser mayor que 0', { campo: 'monto' });
  const tanque = Number(tracto.atributos.capacidadTanqueLitros ?? 0);
  if (e.litros > tanque) {
    throw new ErrorDeDominio('CARGA_EXCEDE_TANQUE', `El tanque de ${tracto.placa} es de ${tanque} L`, { capacidadTanqueLitros: tanque });
  }
  if (e.kilometraje < (tracto.kilometraje ?? 0)) {
    throw new ErrorDeDominio('KILOMETRAJE_INVALIDO', `El odómetro de ${tracto.placa} ya marca ${tracto.kilometraje} km`, {
      kilometrajeActual: tracto.kilometraje,
    });
  }
  if (Date.parse(e.registradaEn) > ahora.getTime() + DESFASE_DE_RELOJ_MS) {
    throw new ErrorDeDominio('VALIDACION', 'registradaEn: está en el futuro', { campo: 'registradaEn' });
  }
}
