package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.ViajesApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CoordenadasDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.EstadoViajeDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.InicioViajeDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ListaViajesDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PaginaViajesDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.TipoCargaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.UltimaPosicionDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ViajeClienteDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ViajeDto;
import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio.UltimaPosicion;
import bo.transporte.viajes.aplicacion.viaje.ConsultaDeViajes;
import bo.transporte.viajes.aplicacion.viaje.InicioDeViaje;
import bo.transporte.viajes.aplicacion.viaje.ViajeVista;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** Viajes del chofer y su inicio (spec 005). Implementa la interfaz generada desde contratos/openapi/viajes.yaml. */
@RestController
class ViajesController implements ViajesApi {
    private final ConsultaDeViajes consulta;
    private final InicioDeViaje inicio;
    private final JsonMapper json;

    ViajesController(ConsultaDeViajes consulta, InicioDeViaje inicio, JsonMapper json) {
        this.consulta = consulta;
        this.inicio = inicio;
        this.json = json;
    }

    @Override
    public ResponseEntity<ListaViajesDto> listarMisViajes() {
        return ResponseEntity.ok(new ListaViajesDto(consulta.mios(SolicitanteActual.obtener()).stream()
                .map(ViajesController::dto)
                .toList()));
    }

    @Override
    public ResponseEntity<PaginaViajesDto> listarViajes(EstadoViajeDto estado, Integer limite, String cursor) {
        var p = consulta.listar(
                SolicitanteActual.obtener(),
                estado == null ? null : EstadoViaje.valueOf(estado.getValue()),
                ServiciosController.desdeCursor(cursor),
                limite == null ? 20 : limite);
        return ResponseEntity.ok(new PaginaViajesDto(
                p.items().stream().map(ViajesController::dto).toList(),
                p.ultimo() == null ? null : ServiciosController.aCursor(p.ultimo())));
    }

    @Override
    public ResponseEntity<ViajeDto> obtenerViaje(UUID viajeId) {
        return ResponseEntity.ok(dto(consulta.porId(SolicitanteActual.obtener(), viajeId)));
    }

    @Override
    public ResponseEntity<ViajeDto> iniciarViaje(UUID viajeId, UUID clave, InicioViajeDto cuerpo) {
        var p = cuerpo.getPosicion();
        var v = inicio.ejecutar(
                SolicitanteActual.obtener(),
                viajeId,
                cuerpo.getIniciadoEn().toInstant(),
                p == null
                        ? null
                        : new InicioDeViaje.Posicion(
                                p.getLat().doubleValue(), p.getLng().doubleValue()),
                clave,
                HashCuerpo.de(json, cuerpo));
        return ResponseEntity.ok(dto(v));
    }

    static ViajeDto dto(ViajeVista v) {
        var d = new ViajeDto(
                        v.viajeId(),
                        v.servicioId(),
                        EstadoViajeDto.fromValue(v.estado().name()),
                        new ViajeClienteDto(v.clienteId(), v.razonSocial()),
                        RutasController.dto(v.ruta()),
                        TipoCargaDto.fromValue(v.tipoCarga().name()),
                        v.toneladas(),
                        v.fechaViaje(),
                        v.placa(),
                        v.choferNombre())
                .motivo(v.motivo());
        if (v.iniciadoEn() != null) d.iniciadoEn(v.iniciadoEn().atOffset(ZoneOffset.UTC));
        var u = v.ultimaPosicion();
        if (u != null) {
            d.ultimaPosicion(new UltimaPosicionDto(
                    coordenadas(u),
                    BigDecimal.valueOf(u.velocidadKmh()),
                    u.registradaEn().atOffset(ZoneOffset.UTC)));
        }
        return d;
    }

    static CoordenadasDto coordenadas(UltimaPosicion u) {
        return new CoordenadasDto(BigDecimal.valueOf(u.lat()), BigDecimal.valueOf(u.lng()));
    }
}
