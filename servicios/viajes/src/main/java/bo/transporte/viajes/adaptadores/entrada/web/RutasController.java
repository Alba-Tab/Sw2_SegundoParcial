package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.RutasApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CoordenadasDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.LugarDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RutaDestinoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RutaDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.RutaNuevaDto;
import bo.transporte.viajes.aplicacion.ruta.ConsultaDeRutas;
import bo.transporte.viajes.aplicacion.ruta.GestionDeRutas;
import bo.transporte.viajes.dominio.ruta.DatosRuta;
import bo.transporte.viajes.dominio.ruta.Ruta;
import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** Catálogo de rutas (spec 002) para cualquier usuario autenticado; alta y edición (G4) para gerente y despachador. */
@RestController
class RutasController implements RutasApi {
    private final ConsultaDeRutas consulta;
    private final GestionDeRutas gestion;
    private final JsonMapper json;

    RutasController(ConsultaDeRutas consulta, GestionDeRutas gestion, JsonMapper json) {
        this.consulta = consulta;
        this.gestion = gestion;
        this.json = json;
    }

    @Override
    public ResponseEntity<List<RutaDto>> listarRutas(Boolean incluirInactivas) {
        return ResponseEntity.ok(consulta.listar(Boolean.TRUE.equals(incluirInactivas)).stream()
                .map(RutasController::dto)
                .toList());
    }

    @Override
    public ResponseEntity<RutaDto> obtenerRuta(UUID rutaId) {
        return ResponseEntity.ok(dto(consulta.porId(rutaId)));
    }

    @Override
    public ResponseEntity<RutaDto> crearRuta(UUID clave, RutaNuevaDto nueva, UUID correlacion) {
        Ruta r = gestion.crear(SolicitanteActual.obtener(), datos(nueva), clave, HashCuerpo.de(json, nueva));
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/rutas/" + r.rutaId()))
                .body(dto(r));
    }

    @Override
    public ResponseEntity<RutaDto> actualizarRuta(UUID rutaId, UUID clave, RutaNuevaDto nueva, UUID correlacion) {
        return ResponseEntity.ok(dto(
                gestion.editar(SolicitanteActual.obtener(), rutaId, datos(nueva), clave, HashCuerpo.de(json, nueva))));
    }

    private static DatosRuta datos(RutaNuevaDto n) {
        var o = n.getOrigen();
        var d = n.getDestino();
        return new DatosRuta(
                n.getNombre(),
                new Ruta.Lugar(o.getNombre(), coordenadas(o.getCoordenadas())),
                new Ruta.Lugar(d.getNombre(), coordenadas(d.getCoordenadas())),
                d.getRadioMetros(),
                n.getDistanciaKm(),
                n.getActiva());
    }

    private static Ruta.Coordenadas coordenadas(CoordenadasDto c) {
        return new Ruta.Coordenadas(c.getLat().doubleValue(), c.getLng().doubleValue());
    }

    static RutaDto dto(Ruta r) {
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
