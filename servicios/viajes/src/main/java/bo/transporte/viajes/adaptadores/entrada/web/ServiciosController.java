package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.ServiciosApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CanalServicioDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CancelacionDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EstadoViajeDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.MontoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PaginaServiciosDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ServicioAceptadoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ServicioDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ServicioNuevoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.TipoCargaDto;
import bo.transporte.viajes.aplicacion.servicio.CancelacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ConfirmacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ConsultaDeServicios;
import bo.transporte.viajes.aplicacion.servicio.ServicioVista;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** Servicios (spec 003). Implementa la interfaz generada desde contratos/openapi/viajes.yaml. */
@RestController
class ServiciosController implements ServiciosApi {
    private final ConfirmacionDeServicio confirmacion;
    private final ConsultaDeServicios consulta;
    private final CancelacionDeServicio cancelacion;
    private final JsonMapper json;

    ServiciosController(
            ConfirmacionDeServicio confirmacion,
            ConsultaDeServicios consulta,
            CancelacionDeServicio cancelacion,
            JsonMapper json) {
        this.confirmacion = confirmacion;
        this.consulta = consulta;
        this.cancelacion = cancelacion;
        this.json = json;
    }

    @Override
    public ResponseEntity<ServicioAceptadoDto> crearServicio(UUID clave, ServicioNuevoDto nuevo, UUID correlacion) {
        var a = confirmacion.ejecutar(
                SolicitanteActual.obtener(),
                nuevo.getCotizacionId(),
                nuevo.getClienteId(),
                clave,
                HashCuerpo.de(json, nuevo));
        return ResponseEntity.accepted()
                .location(URI.create("/api/v1/servicios/" + a.servicioId()))
                .body(new ServicioAceptadoDto(a.servicioId(), a.viajeId(), ServicioAceptadoDto.EstadoEnum.PROGRAMANDO));
    }

    @Override
    public ResponseEntity<PaginaServiciosDto> listarServicios(
            UUID clienteId, EstadoViajeDto estado, Integer limite, String cursor) {
        var pagina = consulta.listar(
                SolicitanteActual.obtener(),
                clienteId,
                estado == null ? null : EstadoViaje.valueOf(estado.getValue()),
                desdeCursor(cursor),
                limite == null ? 20 : limite);
        return ResponseEntity.ok(new PaginaServiciosDto(
                pagina.items().stream().map(ServiciosController::dto).toList(),
                pagina.ultimo() == null ? null : aCursor(pagina.ultimo())));
    }

    @Override
    public ResponseEntity<ServicioDto> obtenerServicio(UUID servicioId) {
        return ResponseEntity.ok(dto(consulta.porId(SolicitanteActual.obtener(), servicioId)));
    }

    @Override
    public ResponseEntity<ServicioDto> cancelarServicio(UUID servicioId, UUID clave, CancelacionDto cuerpo) {
        var v = cancelacion.ejecutar(
                SolicitanteActual.obtener(), servicioId, cuerpo.getMotivo(), clave, HashCuerpo.de(json, cuerpo));
        return ResponseEntity.ok(dto(v));
    }

    static ServicioDto dto(ServicioVista v) {
        var s = v.servicio();
        var d = new ServicioDto(
                        s.servicioId(),
                        s.viajeId(),
                        s.clienteId(),
                        s.cotizacionId(),
                        CanalServicioDto.fromValue(s.canal().name()),
                        EstadoViajeDto.fromValue(v.estado().name()),
                        s.confirmacionCompleta(),
                        s.creadoEn().atOffset(ZoneOffset.UTC))
                .creadoPor(s.creadoPor())
                .motivo(v.motivo());
        if (v.etapa() != null) d.etapa(ServicioDto.EtapaEnum.fromValue(v.etapa()));
        if (v.iniciadoEn() != null) d.iniciadoEn(v.iniciadoEn().atOffset(ZoneOffset.UTC));
        if (v.entregadoEn() != null) d.entregadoEn(v.entregadoEn().atOffset(ZoneOffset.UTC));
        d.facturaId(v.facturaId()).numeroFactura(v.numeroFactura());
        if (v.ultimaPosicion() != null) d.ultimaPosicion(ViajesController.coordenadas(v.ultimaPosicion()));
        var a = v.asignacion();
        if (a != null) {
            d.rutaId(a.rutaId())
                    .tipoCarga(TipoCargaDto.fromValue(a.tipoCarga().name()))
                    .toneladas(a.toneladas())
                    .fechaViaje(a.fechaViaje())
                    .monto(new MontoDto(
                            a.monto().comoTexto(),
                            MontoDto.MonedaEnum.fromValue(a.monto().moneda())))
                    .placa(a.placa())
                    .choferNombre(a.choferNombre());
        }
        return d;
    }

    /** Cursor opaco (000 §4): el último servicioId de la página, en base64url. */
    static String aCursor(UUID ultimo) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(ultimo.toString().getBytes(StandardCharsets.UTF_8));
    }

    static UUID desdeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        try {
            return UUID.fromString(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            throw new ErrorDeDominio("VALIDACION", "cursor: valor inválido", Map.of("campo", "cursor"));
        }
    }
}
