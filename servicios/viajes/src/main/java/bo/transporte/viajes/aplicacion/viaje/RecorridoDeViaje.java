package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenGps;
import java.util.UUID;

/** GET /viajes/{id}/recorrido (spec 005, paso 9): consulta por viajeId en DynamoDB, 1.000 puntos por página. */
public class RecorridoDeViaje {
    private static final int POR_PAGINA = 1000;

    private final ConsultaDeViajes consulta;
    private final AlmacenGps almacen;

    public RecorridoDeViaje(ConsultaDeViajes consulta, AlmacenGps almacen) {
        this.consulta = consulta;
        this.almacen = almacen;
    }

    public AlmacenGps.Pagina recorrido(Solicitante quien, UUID viajeId, String cursor) {
        consulta.legible(quien, viajeId);
        return almacen.recorrido(viajeId, cursor, POR_PAGINA);
    }
}
