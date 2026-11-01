package bo.transporte.viajes.dominio.ruta;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.ruta.Ruta.Coordenadas;
import bo.transporte.viajes.dominio.ruta.Ruta.Lugar;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DatosRutaTest {
    private static final Lugar ORIGEN = new Lugar(" Santa Cruz ", new Coordenadas(-17.78, -63.18));
    private static final Lugar DESTINO = new Lugar("La Paz", new Coordenadas(-16.5, -68.15));

    private static DatosRuta datos(String nombre, Lugar destino, int radio, String km) {
        return new DatosRuta(nombre, ORIGEN, destino, radio, km == null ? null : new BigDecimal(km), true);
    }

    private static String campo(Runnable r) {
        return (String) assertThrows(ErrorDeDominio.class, r::run).datos().get("campo");
    }

    @Test
    void recortaLosNombresYGuardaLaDistanciaConUnDecimal() {
        var d = datos("SCZ – LPZ", DESTINO, 300, "850.06");
        assertEquals("Santa Cruz", d.origen().nombre());
        assertEquals(new BigDecimal("850.1"), d.distanciaKm());
        var r = Ruta.de(UUID.randomUUID(), d, 3);
        assertEquals(3, r.versionAgregado());
        assertEquals(300, r.radioMetros());
    }

    @Test
    void cadaLimiteDiceSuCampo() {
        assertEquals("nombre", campo(() -> datos("AB", DESTINO, 300, "10")));
        assertEquals("destino.radioMetros", campo(() -> datos("Ruta", DESTINO, 49, "10")));
        assertEquals("destino.radioMetros", campo(() -> datos("Ruta", DESTINO, 5001, "10")));
        assertEquals("distanciaKm", campo(() -> datos("Ruta", DESTINO, 300, "0.04")));
        assertEquals("distanciaKm", campo(() -> datos("Ruta", DESTINO, 300, "5000.1")));
        assertEquals("distanciaKm", campo(() -> datos("Ruta", DESTINO, 300, null)));
        assertEquals("destino.nombre", campo(() -> datos("Ruta", new Lugar(" ", DESTINO.coordenadas()), 300, "10")));
        assertEquals(
                "destino.coordenadas",
                campo(() -> datos("Ruta", new Lugar("La Paz", new Coordenadas(91, 0)), 300, "10")));
    }
}
