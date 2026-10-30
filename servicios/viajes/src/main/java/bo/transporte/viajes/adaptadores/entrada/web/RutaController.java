package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.RutaApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CoordenadasDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EventoConduccionDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EventoConduccionNuevoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.HitoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.HitoNuevoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ListaHitosDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.LoteGpsDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PaginaRecorridoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PuntoRecorridoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ResultadoLoteGpsDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.TipoHitoDto;
import bo.transporte.viajes.aplicacion.viaje.BitacoraDeRuta;
import bo.transporte.viajes.aplicacion.viaje.RecorridoDeViaje;
import bo.transporte.viajes.aplicacion.viaje.RegistroDeGps;
import bo.transporte.viajes.dominio.viaje.EventoConduccion;
import bo.transporte.viajes.dominio.viaje.Hito;
import bo.transporte.viajes.dominio.viaje.PuntoGps;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** El viaje en ruta (spec 005): lotes de GPS, recorrido, hitos y eventos de conducción. */
@RestController
class RutaController implements RutaApi {
    private static final Logger LOG = LoggerFactory.getLogger(RutaController.class);

    private final RegistroDeGps gps;
    private final RecorridoDeViaje recorrido;
    private final BitacoraDeRuta bitacora;
    private final JsonMapper json;

    RutaController(RegistroDeGps gps, RecorridoDeViaje recorrido, BitacoraDeRuta bitacora, JsonMapper json) {
        this.gps = gps;
        this.recorrido = recorrido;
        this.bitacora = bitacora;
        this.json = json;
    }

    @Override
    public ResponseEntity<ResultadoLoteGpsDto> registrarLoteGps(UUID viajeId, UUID loteId, LoteGpsDto cuerpo) {
        // La clave es el loteId: va a los logs, pero la autoridad es la llave de DynamoDB (excepción de 000 §4.1).
        LOG.info(
                "Lote GPS {} del viaje {}: {} puntos",
                loteId,
                viajeId,
                cuerpo.getPuntos().size());
        var puntos = cuerpo.getPuntos().stream()
                .map(p -> new PuntoGps(
                        p.getSeq(),
                        p.getRegistradaEn().toInstant(),
                        p.getLat().doubleValue(),
                        p.getLng().doubleValue(),
                        p.getVelocidadKmh().doubleValue(),
                        p.getPrecisionMetros() == null
                                ? null
                                : p.getPrecisionMetros().doubleValue()))
                .toList();
        var r = gps.registrar(SolicitanteActual.obtener(), viajeId, cuerpo.getDispositivoId(), puntos);
        return ResponseEntity.ok(new ResultadoLoteGpsDto(
                r.aceptados(), Math.toIntExact(r.ultimaSecuencia()), r.ultimaPosicionActualizada()));
    }

    @Override
    public ResponseEntity<PaginaRecorridoDto> obtenerRecorrido(UUID viajeId, String cursor) {
        var p = recorrido.recorrido(SolicitanteActual.obtener(), viajeId, cursor);
        var items = p.items().stream()
                .map(g -> {
                    var punto = g.punto();
                    return new PuntoRecorridoDto(
                                    Math.toIntExact(punto.seq()),
                                    punto.registradaEn().atOffset(ZoneOffset.UTC),
                                    BigDecimal.valueOf(punto.lat()),
                                    BigDecimal.valueOf(punto.lng()),
                                    BigDecimal.valueOf(punto.velocidadKmh()),
                                    g.dispositivoId())
                            .precisionMetros(
                                    punto.precisionMetros() == null
                                            ? null
                                            : BigDecimal.valueOf(punto.precisionMetros()));
                })
                .toList();
        return ResponseEntity.ok(new PaginaRecorridoDto(items, p.siguienteCursor()));
    }

    @Override
    public ResponseEntity<HitoDto> registrarHito(UUID viajeId, UUID clave, HitoNuevoDto cuerpo) {
        var h = new Hito(
                cuerpo.getHitoId(),
                viajeId,
                Hito.Tipo.valueOf(cuerpo.getTipo().getValue()),
                cuerpo.getDescripcion(),
                cuerpo.getPosicion().getLat().doubleValue(),
                cuerpo.getPosicion().getLng().doubleValue(),
                cuerpo.getRegistradoEn().toInstant(),
                Hito.Origen.valueOf(cuerpo.getOrigen().getValue()));
        var guardado = bitacora.registrarHito(SolicitanteActual.obtener(), h, clave, HashCuerpo.de(json, cuerpo));
        return ResponseEntity.ok(dto(guardado));
    }

    @Override
    public ResponseEntity<ListaHitosDto> listarHitos(UUID viajeId, String texto) {
        return ResponseEntity.ok(new ListaHitosDto(bitacora.hitos(SolicitanteActual.obtener(), viajeId, texto).stream()
                .map(RutaController::dto)
                .toList()));
    }

    @Override
    public ResponseEntity<EventoConduccionDto> registrarEventoConduccion(
            UUID viajeId, UUID clave, EventoConduccionNuevoDto cuerpo) {
        var e = new EventoConduccion(
                cuerpo.getEventoId(),
                viajeId,
                EventoConduccion.Tipo.valueOf(cuerpo.getTipo().getValue()),
                cuerpo.getMagnitudG(),
                cuerpo.getPosicion().getLat().doubleValue(),
                cuerpo.getPosicion().getLng().doubleValue(),
                cuerpo.getRegistradoEn().toInstant());
        var g = bitacora.registrarEvento(SolicitanteActual.obtener(), e, clave, HashCuerpo.de(json, cuerpo));
        return ResponseEntity.ok(new EventoConduccionDto()
                .eventoId(g.eventoId())
                .viajeId(g.viajeId())
                .tipo(EventoConduccionDto.TipoEnum.fromValue(g.tipo().name()))
                .magnitudG(g.magnitudG())
                .posicion(new CoordenadasDto(BigDecimal.valueOf(g.lat()), BigDecimal.valueOf(g.lng())))
                .registradoEn(g.registradoEn().atOffset(ZoneOffset.UTC)));
    }

    private static HitoDto dto(Hito h) {
        return new HitoDto()
                .hitoId(h.hitoId())
                .viajeId(h.viajeId())
                .tipo(TipoHitoDto.fromValue(h.tipo().name()))
                .descripcion(h.descripcion())
                .posicion(new CoordenadasDto(BigDecimal.valueOf(h.lat()), BigDecimal.valueOf(h.lng())))
                .registradoEn(h.registradoEn().atOffset(ZoneOffset.UTC))
                .origen(HitoDto.OrigenEnum.fromValue(h.origen().name()));
    }
}
