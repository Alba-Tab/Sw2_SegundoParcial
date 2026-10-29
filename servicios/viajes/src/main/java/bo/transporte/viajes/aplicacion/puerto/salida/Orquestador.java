package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.aplicacion.servicio.ParametrosSaga;
import bo.transporte.viajes.dominio.viaje.Servicio;
import java.util.Optional;

/** El motor de la saga ProgramarViaje (Temporal, contratos/temporal/programar-viaje.md). */
public interface Orquestador {
    /** Inicia el workflow del servicio. Si ya existe (mismo workflowId) no hace nada (D43). */
    void iniciar(Servicio servicio, ParametrosSaga parametros);

    /** Etapa de la consulta {@code estado}; vacío si el motor no responde a tiempo. */
    Optional<String> etapa(String workflowId);

    /** Señal {@code aprobacionCredito} (spec 012). Lanza {@link NoDisponible} si Temporal no la recibe. */
    void aprobarCredito(String workflowId, boolean aprobado, String aprobadoPor, String motivo);

    /** Señal {@code resolverIntervencion} (spec 011). Lanza {@link NoDisponible} si Temporal no la recibe. */
    void resolverIntervencion(String workflowId, String opcion, String resueltoPor, String nota);

    class NoDisponible extends RuntimeException {
        public NoDisponible(String mensaje, Throwable causa) {
            super(mensaje, causa);
        }
    }
}
