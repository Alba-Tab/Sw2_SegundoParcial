package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.EntregasApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CoordenadasDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.DecisionEntregaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EntregaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EntregaNuevaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RazonObservacionDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RechazoDespachadorDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RechazoReceptorDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ResultadoEntregaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ViajeDto;
import bo.transporte.viajes.aplicacion.viaje.EntregaDeViaje;
import bo.transporte.viajes.aplicacion.viaje.ResultadoEntrega;
import bo.transporte.viajes.dominio.viaje.Entrega;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** Entrega, entrega observada y rechazos (specs 006 y 007). Implementa la interfaz generada del contrato. */
@RestController
class EntregasController implements EntregasApi {
    private final EntregaDeViaje entregas;
    private final JsonMapper json;

    EntregasController(EntregaDeViaje entregas, JsonMapper json) {
        this.entregas = entregas;
        this.json = json;
    }

    @Override
    public ResponseEntity<ResultadoEntregaDto> registrarEntrega(UUID viajeId, UUID clave, EntregaNuevaDto e) {
        var f = e.getFirma();
        var r = entregas.entregar(
                SolicitanteActual.obtener(),
                viajeId,
                e.getEntregaId(),
                e.getEntregadoEn().toInstant(),
                e.getPosicion().getLat().doubleValue(),
                e.getPosicion().getLng().doubleValue(),
                e.getPrecisionMetros() == null ? null : e.getPrecisionMetros().doubleValue(),
                e.getFotos().stream().toList(),
                f == null ? null : new EntregaDeViaje.Firma(f.getEvidenciaId(), f.getNombreReceptor()),
                e.getObservacion(),
                clave,
                HashCuerpo.de(json, e));
        return ResponseEntity.ok(dto(r));
    }

    @Override
    public ResponseEntity<ResultadoEntregaDto> registrarRechazoReceptor(
            UUID viajeId, UUID clave, RechazoReceptorDto r) {
        var res = entregas.rechazoReceptor(
                SolicitanteActual.obtener(),
                viajeId,
                r.getEntregaId(),
                r.getRechazadaEn().toInstant(),
                r.getPosicion().getLat().doubleValue(),
                r.getPosicion().getLng().doubleValue(),
                r.getMotivo(),
                r.getFotos().stream().toList(),
                clave,
                HashCuerpo.de(json, r));
        return ResponseEntity.ok(dto(res));
    }

    @Override
    public ResponseEntity<ViajeDto> aprobarEntregaObservada(UUID viajeId, UUID clave, DecisionEntregaDto d) {
        var v = entregas.aprobar(SolicitanteActual.obtener(), viajeId, d.getNota(), clave, HashCuerpo.de(json, d));
        return ResponseEntity.ok(ViajesController.dto(v));
    }

    @Override
    public ResponseEntity<ViajeDto> rechazarEntregaObservada(UUID viajeId, UUID clave, RechazoDespachadorDto d) {
        var v = entregas.rechazar(SolicitanteActual.obtener(), viajeId, d.getMotivo(), clave, HashCuerpo.de(json, d));
        return ResponseEntity.ok(ViajesController.dto(v));
    }

    @Override
    public ResponseEntity<EntregaDto> obtenerEntrega(UUID viajeId) {
        Entrega e = entregas.obtener(SolicitanteActual.obtener(), viajeId);
        var d = new EntregaDto(
                        e.entregaId(),
                        e.viajeId(),
                        EntregaDto.TipoEnum.fromValue(e.tipo().name()),
                        e.registradaEn().atOffset(ZoneOffset.UTC),
                        new CoordenadasDto(BigDecimal.valueOf(e.lat()), BigDecimal.valueOf(e.lng())),
                        BigDecimal.valueOf(e.distanciaMetros()),
                        e.dentroGeocerca(),
                        e.conFirma(),
                        e.fotos())
                .razones(
                        e.razones().stream().map(RazonObservacionDto::fromValue).toList())
                .nombreReceptor(e.nombreReceptor())
                .firmaEvidenciaId(e.firmaEvidenciaId())
                .observacion(e.observacion())
                .motivo(e.motivo())
                .decididaPor(e.decididaPor());
        if (e.precisionMetros() != null) d.precisionMetros(BigDecimal.valueOf(e.precisionMetros()));
        if (e.decision() != null) d.decision(EntregaDto.DecisionEnum.fromValue(e.decision()));
        return ResponseEntity.ok(d);
    }

    private static ResultadoEntregaDto dto(ResultadoEntrega r) {
        return new ResultadoEntregaDto(
                        r.viajeId(),
                        r.entregaId(),
                        ResultadoEntregaDto.EstadoEnum.fromValue(r.estado().name()),
                        r.dentroGeocerca(),
                        BigDecimal.valueOf(r.distanciaMetros()),
                        r.conFirma())
                .razones(
                        r.razones().stream().map(RazonObservacionDto::fromValue).toList());
    }
}
