package bo.transporte.viajes.aplicacion.saga;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * POST /api/v1/servicios/{servicioId}/aprobacion-credito (spec 012): solo administración, con el servicio en
 * PROGRAMANDO y el workflow en ESPERANDO_APROBACION. Envía {@code aprobacionCredito} con {@code aprobadoPor = sub}.
 */
public class DecisionDeCredito extends SenalDeSaga {
    public static final String OPERACION = "DECIDIR_CREDITO";
    private final ServicioRepositorio servicios;

    public DecisionDeCredito(
            ServicioRepositorio servicios,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Orquestador orquestador) {
        super(idempotencia, auditoria, tx, orquestador);
        this.servicios = servicios;
    }

    public void ejecutar(
            Solicitante quien, UUID servicioId, boolean aprobado, String motivo, UUID clave, String hashCuerpo) {
        Map<String, Object> datos = new LinkedHashMap<>();
        datos.put("aprobado", aprobado);
        if (motivo != null) datos.put("motivo", motivo);
        enviarUnaVez(
                clave,
                OPERACION,
                hashCuerpo,
                () -> {
                    if (!quien.tiene("administracion")) {
                        throw new ErrorDeDominio("SIN_PERMISO", "Solo administración aprueba o rechaza crédito");
                    }
                    if (!aprobado && (motivo == null || motivo.isBlank())) {
                        throw new ErrorDeDominio(
                                "VALIDACION", "motivo: es obligatorio al rechazar", Map.of("campo", "motivo"));
                    }
                    var f = servicios
                            .conViaje(servicioId)
                            .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el servicio"));
                    if (f.estado() != EstadoViaje.PROGRAMANDO) {
                        throw new ErrorDeDominio("CONFLICTO_ESTADO", "El servicio ya no espera aprobación");
                    }
                    String workflowId = f.servicio().workflowId();
                    exigirEtapa(workflowId, "ESPERANDO_APROBACION", "El servicio no está esperando aprobación");
                    orquestador.aprobarCredito(workflowId, aprobado, quien.sub(), motivo);
                },
                quien,
                "Servicio",
                servicioId,
                datos);
    }
}
