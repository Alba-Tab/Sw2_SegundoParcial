package bo.transporte.viajes.aplicacion.ruta;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.ruta.Ruta;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Catálogo de rutas para cualquier usuario autenticado (spec 002). Las inactivas solo las ven quienes las gestionan
 * (gerente y despachador, F2-3): para los demás, {@code incluirInactivas} se ignora y una ruta inactiva no existe.
 */
public class ConsultaDeRutas {
    private static final Set<String> VEN_INACTIVAS = Set.of("gerente", "despachador");

    private final RutaRepositorio rutas;

    public ConsultaDeRutas(RutaRepositorio rutas) {
        this.rutas = rutas;
    }

    /** Las activas; con {@code incluirInactivas} y rol de gestión, todas (G4). */
    public List<Ruta> listar(Solicitante quien, boolean incluirInactivas) {
        return incluirInactivas && quien.tieneAlguno(VEN_INACTIVAS) ? rutas.todas() : rutas.activas();
    }

    public Ruta porId(Solicitante quien, UUID rutaId) {
        return rutas.porId(rutaId)
                .filter(r -> r.activa() || quien.tieneAlguno(VEN_INACTIVAS))
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "La ruta no existe"));
    }
}
