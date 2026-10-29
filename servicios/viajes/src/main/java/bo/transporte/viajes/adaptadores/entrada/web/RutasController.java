package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.RutasApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CoordenadasDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.LugarDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RutaDestinoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RutaDto;
import bo.transporte.viajes.aplicacion.ruta.ConsultaDeRutas;
import bo.transporte.viajes.dominio.ruta.Ruta;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Catálogo de rutas (spec 002) para cualquier usuario autenticado. */
@RestController
class RutasController implements RutasApi {
    private final ConsultaDeRutas consulta;

    RutasController(ConsultaDeRutas consulta) {
        this.consulta = consulta;
    }

    @Override
    public ResponseEntity<List<RutaDto>> listarRutas() {
        return ResponseEntity.ok(
                consulta.activas().stream().map(RutasController::dto).toList());
    }

    @Override
    public ResponseEntity<RutaDto> obtenerRuta(UUID rutaId) {
        return ResponseEntity.ok(dto(consulta.porId(rutaId)));
    }

    private static RutaDto dto(Ruta r) {
        return new RutaDto(
                r.rutaId(),
                r.nombre(),
                new LugarDto(r.origen().nombre(), coordenadas(r.origen().coordenadas())),
                new RutaDestinoDto(r.destino().nombre(), coordenadas(r.destino().coordenadas()), r.radioMetros()),
                r.distanciaKm(),
                r.activa());
    }

    private static CoordenadasDto coordenadas(Ruta.Coordenadas c) {
        return new CoordenadasDto(BigDecimal.valueOf(c.lat()), BigDecimal.valueOf(c.lng()));
    }
}
