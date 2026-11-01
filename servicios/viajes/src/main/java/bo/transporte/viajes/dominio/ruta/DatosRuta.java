package bo.transporte.viajes.dominio.ruta;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.ruta.Ruta.Coordenadas;
import bo.transporte.viajes.dominio.ruta.Ruta.Lugar;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * Lo que se escribe de una ruta en el alta y la edición (G4), con los límites de RutaActualizada.v1: nombre de 3 a 80,
 * lugares de 2 a 80, radio de la geocerca de 50 a 5000 m (D06) y distancia mayor que 0 y hasta 5000 km, con un
 * decimal como la columna.
 */
public record DatosRuta(
        String nombre, Lugar origen, Lugar destino, int radioMetros, BigDecimal distanciaKm, boolean activa) {

    public DatosRuta {
        nombre = recortar(nombre);
        exigir(nombre.length() >= 3 && nombre.length() <= 80, "nombre", "Debe tener entre 3 y 80 caracteres");
        origen = lugar(origen, "origen");
        destino = lugar(destino, "destino");
        exigir(radioMetros >= 50 && radioMetros <= 5000, "destino.radioMetros", "Debe estar entre 50 y 5000");
        distanciaKm = distanciaKm == null ? null : distanciaKm.setScale(1, RoundingMode.HALF_UP);
        exigir(
                distanciaKm != null && distanciaKm.signum() > 0 && distanciaKm.compareTo(BigDecimal.valueOf(5000)) <= 0,
                "distanciaKm",
                "Debe ser mayor que 0 y de hasta 5000 km");
    }

    /** F1-2: una ruta nueva nace inactiva; las tarifas son de semilla (D10) y sin tarifa no se cotiza. */
    public DatosRuta inactiva() {
        return new DatosRuta(nombre, origen, destino, radioMetros, distanciaKm, false);
    }

    private static Lugar lugar(Lugar l, String campo) {
        String nombre = recortar(l == null ? null : l.nombre());
        exigir(nombre.length() >= 2 && nombre.length() <= 80, campo + ".nombre", "Debe tener entre 2 y 80 caracteres");
        Coordenadas c = l.coordenadas();
        exigir(
                c != null && Math.abs(c.lat()) <= 90 && Math.abs(c.lng()) <= 180,
                campo + ".coordenadas",
                "Latitud entre -90 y 90 y longitud entre -180 y 180");
        return new Lugar(nombre, c);
    }

    private static String recortar(String s) {
        return s == null ? "" : s.strip();
    }

    private static void exigir(boolean ok, String campo, String mensaje) {
        if (!ok) throw new ErrorDeDominio("VALIDACION", campo + ": " + mensaje, Map.of("campo", campo));
    }
}
