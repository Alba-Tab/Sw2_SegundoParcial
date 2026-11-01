package bo.transporte.viajes.aplicacion.ruta;

import bo.transporte.viajes.aplicacion.comun.OperacionIdempotente;
import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.comun.Uuid7;
import bo.transporte.viajes.dominio.ruta.DatosRuta;
import bo.transporte.viajes.dominio.ruta.Ruta;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * POST /api/v1/rutas y PUT /api/v1/rutas/{rutaId} (G4, D104), para gerente y despachador. Una ruta nueva nace
 * inactiva hasta tener su tarifa (F1-2, D10); se activa al editarla. En una transacción: guarda
 * la ruta con su nueva {@code versionAgregado}, audita y deja RutaActualizada en el Outbox (Finanzas y Analítica
 * actualizan su copia y descartan versiones viejas).
 */
public class GestionDeRutas {
    public static final String CREAR = "CREAR_RUTA";
    public static final String EDITAR = "EDITAR_RUTA";
    private static final Set<String> GESTIONAN = Set.of("gerente", "despachador");

    private final RutaRepositorio rutas;
    private final RegistroDeEventos eventos;
    private final Auditoria auditoria;
    private final OperacionIdempotente operacion;

    public GestionDeRutas(
            RutaRepositorio rutas, RegistroDeEventos eventos, Auditoria auditoria, OperacionIdempotente operacion) {
        this.rutas = rutas;
        this.eventos = eventos;
        this.auditoria = auditoria;
        this.operacion = operacion;
    }

    public Ruta crear(Solicitante quien, DatosRuta datos, UUID clave, String hashCuerpo) {
        exigirPermiso(quien);
        return operacion
                .ejecutar(
                        CREAR,
                        clave,
                        hashCuerpo,
                        201,
                        () -> guardar(quien, CREAR, Ruta.de(Uuid7.nuevo(), datos.inactiva(), 1)))
                .respuesta();
    }

    public Ruta editar(Solicitante quien, UUID rutaId, DatosRuta datos, UUID clave, String hashCuerpo) {
        exigirPermiso(quien);
        return operacion
                .ejecutar(EDITAR, clave, hashCuerpo, 200, () -> {
                    Ruta actual = rutas.paraActualizar(rutaId)
                            .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "La ruta no existe"));
                    return guardar(quien, EDITAR, Ruta.de(rutaId, datos, actual.versionAgregado() + 1));
                })
                .respuesta();
    }

    private static void exigirPermiso(Solicitante quien) {
        if (!quien.tieneAlguno(GESTIONAN)) {
            throw new ErrorDeDominio("SIN_PERMISO", "Solo el gerente y el despachador gestionan rutas");
        }
    }

    private Ruta guardar(Solicitante quien, String accion, Ruta ruta) {
        rutas.guardar(ruta);
        eventos.registrar("RutaActualizada", "viajes.ruta-actualizada.v1", datosDelEvento(ruta));
        auditoria.registrar(
                quien,
                "CENTRO_CONTROL",
                accion,
                "Ruta",
                ruta.rutaId(),
                Map.of("nombre", ruta.nombre(), "activa", ruta.activa(), "versionAgregado", ruta.versionAgregado()));
        return ruta;
    }

    /** contratos/eventos/viajes/RutaActualizada.v1.schema.json#/properties/datos */
    static Map<String, Object> datosDelEvento(Ruta r) {
        Map<String, Object> destino = lugar(r.destino());
        destino.put("radioMetros", r.radioMetros());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rutaId", r.rutaId().toString());
        m.put("versionAgregado", r.versionAgregado());
        m.put("nombre", r.nombre());
        m.put("origen", lugar(r.origen()));
        m.put("destino", destino);
        m.put("distanciaKm", r.distanciaKm());
        m.put("activa", r.activa());
        return m;
    }

    private static Map<String, Object> lugar(Ruta.Lugar l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("nombre", l.nombre());
        m.put(
                "coordenadas",
                Map.of("lat", l.coordenadas().lat(), "lng", l.coordenadas().lng()));
        return m;
    }
}
