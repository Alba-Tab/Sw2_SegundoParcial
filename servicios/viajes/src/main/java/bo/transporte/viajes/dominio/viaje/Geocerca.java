package bo.transporte.viajes.dominio.viaje;

/** Distancia haversine en metros (spec 006, D06). La precisión del GPS no se suma (D64). */
public final class Geocerca {
    private static final double RADIO_TIERRA_METROS = 6_371_000;

    private Geocerca() {}

    public static double distanciaMetros(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * RADIO_TIERRA_METROS * Math.asin(Math.sqrt(a));
    }
}
