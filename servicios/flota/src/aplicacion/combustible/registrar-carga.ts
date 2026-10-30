import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import { uuid7 } from '../../dominio/comun/uuid7';
import { type CargaCombustible, validarCarga } from '../../dominio/combustible/carga';
import type { ChoferRepositorio } from '../puertos/chofer-repositorio';
import type { CombustibleRepositorio } from '../puertos/combustible-repositorio';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { Reloj } from '../puertos/reloj';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

export interface CargaNueva {
  opId: string;
  viajeId: string;
  litros: number;
  monto: { monto: string; moneda: string };
  kilometraje: number;
  registradaEn: string;
  posicion?: { lat: number; lng: number };
  fotoReciboEvidenciaId?: string;
}

/**
 * POST /cargas-combustible (spec 009). En una transacción de Mongo: la carga con su opId (autoridad de idempotencia), el
 * odómetro del tracto y CargaCombustibleRegistrada en el Outbox. Se acepta aunque la reserva ya esté LIBERADA (la carga
 * llegó tarde por falta de señal); la foto se guarda sin consultar a Viajes.
 */
export class RegistrarCarga {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly combustible: CombustibleRepositorio,
    private readonly reservas: ReservaUnidadRepositorio,
    private readonly unidades: UnidadRepositorio,
    private readonly choferes: ChoferRepositorio,
    private readonly eventos: RegistroDeEventos,
    private readonly reloj: Reloj,
  ) {}

  ejecutar(usuario: { sub: string; roles: string[] }, clave: string, e: CargaNueva, hashCuerpo: string): Promise<CargaCombustible> {
    return this.tx.ejecutar(async () => {
      if (!usuario.roles.includes('chofer')) throw new ErrorDeDominio('SIN_PERMISO', 'Solo el chofer registra cargas');
      if (clave !== e.opId) {
        throw new ErrorDeDominio('VALIDACION', 'Idempotency-Key: debe ser igual a opId', { campo: 'Idempotency-Key' });
      }
      const previa = await this.combustible.cargaPorOpId(e.opId);
      if (previa) {
        if (previa.hashCuerpo !== hashCuerpo) {
          throw new ErrorDeDominio('IDEMPOTENCIA_CUERPO_DISTINTO', 'Ese opId ya se usó con otra carga');
        }
        const { hashCuerpo: _h, ...carga } = previa;
        return carga;
      }
      const reserva = await this.reservas.porViaje(e.viajeId);
      if (!reserva?.tractoId || !reserva.choferId) throw new ErrorDeDominio('NO_ENCONTRADO', 'No hay reserva de unidad para ese viaje');
      const chofer = await this.choferes.porId(reserva.choferId);
      if (chofer?.usuarioSub !== usuario.sub) throw new ErrorDeDominio('SIN_PERMISO', 'El viaje es de otro chofer');
      const tracto = await this.unidades.porId(reserva.tractoId);
      if (!tracto) throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe el tracto de la reserva');
      validarCarga(tracto, e, this.reloj.ahora());

      const carga: CargaCombustible = {
        cargaId: uuid7(),
        opId: e.opId,
        viajeId: e.viajeId,
        tractoId: tracto.unidadId,
        placa: tracto.placa,
        choferId: reserva.choferId,
        litros: e.litros,
        monto: { monto: e.monto.monto, moneda: 'BOB' },
        kilometraje: e.kilometraje,
        registradaEn: e.registradaEn,
        ...(e.posicion ? { posicion: e.posicion } : {}),
        ...(e.fotoReciboEvidenciaId ? { fotoReciboEvidenciaId: e.fotoReciboEvidenciaId } : {}),
      };
      await this.combustible.insertarCarga(carga, hashCuerpo);
      await this.unidades.guardar({ ...tracto, kilometraje: e.kilometraje });
      const { fotoReciboEvidenciaId: _f, ...datos } = carga;
      await this.eventos.registrar('CargaCombustibleRegistrada', 'flota.carga-combustible-registrada.v1', datos);
      return carga;
    });
  }
}
