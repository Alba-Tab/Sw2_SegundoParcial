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

    public record Coordenadas(double lat, double lng) {}

    public record Lugar(String nombre, Coordenadas coordenadas) {}
}
