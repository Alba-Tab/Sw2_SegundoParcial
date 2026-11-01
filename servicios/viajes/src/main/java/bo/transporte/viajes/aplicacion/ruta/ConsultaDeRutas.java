package bo.transporte.viajes.aplicacion.ruta;

import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.ruta.Ruta;
import java.util.List;
import java.util.UUID;

/** Catálogo de rutas para cualquier usuario autenticado (spec 002). */
public class ConsultaDeRutas {
    private final RutaRepositorio rutas;

    public ConsultaDeRutas(RutaRepositorio rutas) {
        this.rutas = rutas;
    }

    /** Las activas; con {@code incluirInactivas}, todas (gestión de rutas, G4). */
    public List<Ruta> listar(boolean incluirInactivas) {
        return incluirInactivas ? rutas.todas() : rutas.activas();
    }

    public Ruta porId(UUID rutaId) {
        return rutas.porId(rutaId).orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "La ruta no existe"));
    }
}
