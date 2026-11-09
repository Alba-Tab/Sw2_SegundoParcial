package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.EvidenciasApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CompletarEvidenciaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EvidenciaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EvidenciaNuevaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ParteFirmadaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ParteSubidaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.SubidaEvidenciaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.TipoEvidenciaDto;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias.Parte;
import bo.transporte.viajes.aplicacion.viaje.SubidaDeEvidencia;
import bo.transporte.viajes.dominio.viaje.Evidencia;
import java.net.URI;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Evidencias por partes (spec 006, D40a). La clave de idempotencia es obligatoria; la autoridad es el evidenciaId. */
@RestController
class EvidenciasController implements EvidenciasApi {
    private final SubidaDeEvidencia subida;

    EvidenciasController(SubidaDeEvidencia subida) {
        this.subida = subida;
    }

    @Override
    public ResponseEntity<SubidaEvidenciaDto> crearSubidaEvidencia(UUID viajeId, UUID clave, EvidenciaNuevaDto n) {
        var s = subida.crear(
                SolicitanteActual.obtener(),
                viajeId,
                n.getEvidenciaId(),
                Evidencia.Tipo.valueOf(n.getTipo().getValue()),
                n.getContentType().getValue(),
                n.getTamanoBytes());
        return ResponseEntity.status(201).body(dto(s));
    }

    @Override
    public ResponseEntity<SubidaEvidenciaDto> listarPartesEvidencia(UUID viajeId, UUID evidenciaId) {
        return ResponseEntity.ok(dto(subida.partes(SolicitanteActual.obtener(), viajeId, evidenciaId)));
    }

    @Override
    public ResponseEntity<EvidenciaDto> completarSubidaEvidencia(
            UUID viajeId, UUID evidenciaId, UUID clave, CompletarEvidenciaDto c) {
        var partes = c.getPartes().stream()
                .map(p -> new Parte(p.getNumero(), p.getEtag()))
                .toList();
        return ResponseEntity.ok(
                dto(subida.completar(SolicitanteActual.obtener(), viajeId, evidenciaId, partes), null));
    }

    @Override
    public ResponseEntity<EvidenciaDto> obtenerEvidencia(UUID viajeId, UUID evidenciaId) {
        var v = subida.obtener(SolicitanteActual.obtener(), viajeId, evidenciaId);
        return ResponseEntity.ok(dto(v.evidencia(), v.descarga()));
    }

    private static SubidaEvidenciaDto dto(SubidaDeEvidencia.Subida s) {
        return new SubidaEvidenciaDto(
                s.evidenciaId(),
                s.completa() ? SubidaEvidenciaDto.EstadoEnum.COMPLETA : SubidaEvidenciaDto.EstadoEnum.SUBIENDO,
                (int) Evidencia.TAMANO_PARTE,
                s.partes().stream()
                        .map(u -> new ParteFirmadaDto(
                                u.numero(), URI.create(u.url()), u.expiraEn().atOffset(ZoneOffset.UTC)))
                        .toList(),
                s.subidas().stream()
                        .map(p -> new ParteSubidaDto(p.numero(), p.etag()))
                        .toList());
    }

    private static EvidenciaDto dto(
            Evidencia e, bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias.UrlFirmada descarga) {
        var d = new EvidenciaDto(
                e.evidenciaId(),
                e.viajeId(),
                TipoEvidenciaDto.fromValue(e.tipo().name()),
                e.completa() ? EvidenciaDto.EstadoEnum.COMPLETA : EvidenciaDto.EstadoEnum.SUBIENDO,
                e.contentType(),
                (int) e.tamanoBytes());
        if (descarga != null) {
            d.url(URI.create(descarga.url())).expiraEn(descarga.expiraEn().atOffset(ZoneOffset.UTC));
        }
        return d;
    }
}
