package bo.transporte.viajes.dominio.ruta;

import java.math.BigDecimal;
import java.util.UUID;

/** Ruta del catálogo (spec 002, D06): el destino lleva el radio de la geocerca y la ruta su distancia en km. */
public record Ruta(
        UUID rutaId,
        String nombre,
        Lugar origen,
        Lugar destino,
        int radioMetros,
        BigDecimal distanciaKm,
        boolean activa,
        int versionAgregado) {

    /** Una ruta nueva o editada, con la versión que le toca (1 al crearla; la anterior + 1 al editarla). */
    public static Ruta de(UUID rutaId, DatosRuta d, int versionAgregado) {
        return new Ruta(
                rutaId,
                d.nombre(),
                d.origen(),
                d.destino(),
                d.radioMetros(),
                d.distanciaKm(),
                d.activa(),
                versionAgregado);
    }

    public record Coordenadas(double lat, double lng) {}

    public record Lugar(String nombre, Coordenadas coordenadas) {}
}
