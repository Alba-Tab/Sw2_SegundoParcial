import { uuid7 } from '../../dominio/comun/uuid7';
import { detectarCaida, inicioDeParada, type Lectura, VENTANA_MINUTOS } from '../../dominio/combustible/caida';
import type { CombustibleRepositorio } from '../puertos/combustible-repositorio';
import type { RegistroDeEventos } from '../puertos/registro-de-eventos';
import type { ReservaUnidadRepositorio } from '../puertos/reserva-unidad-repositorio';
import type { UnidadDeTrabajo } from '../puertos/unidad-de-trabajo';
import type { UnidadRepositorio } from '../puertos/unidad-repositorio';

export type ResultadoLectura = 'PLACA_DESCONOCIDA' | 'REPETIDA' | 'GUARDADA' | 'CAIDA';

/**
 * Lectura del sensor desde flota.sensor (spec 009, D30): la guarda (una por placa e instante) y aplica la regla de caída.
 * Con una caída, en una transacción, guarda la detección y deja CaidaCombustibleDetectada en el Outbox, con el viajeId si
 * el tracto está EN_VIAJE. Una detección por episodio de parada.
 */
export class ProcesarLectura {
  constructor(
    private readonly tx: UnidadDeTrabajo,
    private readonly combustible: CombustibleRepositorio,
    private readonly unidades: UnidadRepositorio,
    private readonly reservas: ReservaUnidadRepositorio,
    private readonly eventos: RegistroDeEventos,
  ) {}

  async ejecutar(l: Lectura): Promise<ResultadoLectura> {
    const tracto = await this.unidades.porPlaca(l.placa);
    if (!tracto || tracto.tipoUnidad !== 'TRACTO') return 'PLACA_DESCONOCIDA';
    if (!(await this.combustible.insertarLectura(l))) return 'REPETIDA';
    const desde = new Date(Date.parse(l.medidoEn) - (VENTANA_MINUTOS + 5) * 60_000).toISOString();
    const anteriores = (await this.combustible.lecturasDesde(l.placa, desde)).filter((x) => x.medidoEn !== l.medidoEn);
    const caida = detectarCaida(anteriores, l);
    if (!caida) return 'GUARDADA';
    const paradaDesde = inicioDeParada(anteriores, l);
    return this.tx.ejecutar(async () => {
      if (await this.combustible.deteccionDeParada(l.placa, paradaDesde)) return 'GUARDADA' as const;
      const reserva = tracto.estado === 'EN_VIAJE' ? await this.reservas.activaDeUnidad(tracto.unidadId) : null;
      const d = {
        deteccionId: uuid7(),
        tractoId: tracto.unidadId,
        placa: l.placa,
        ...(reserva?.viajeId ? { viajeId: reserva.viajeId } : {}),
        ...caida,
        velocidadKmh: l.velocidadKmh,
        detectadaEn: l.medidoEn,
        paradaDesde,
      };
      await this.combustible.insertarDeteccion(d);
      const { paradaDesde: _p, ...datos } = d;
      await this.eventos.registrar('CaidaCombustibleDetectada', 'flota.caida-combustible-detectada.v1', datos);
      return 'CAIDA' as const;
    });
  }
}
