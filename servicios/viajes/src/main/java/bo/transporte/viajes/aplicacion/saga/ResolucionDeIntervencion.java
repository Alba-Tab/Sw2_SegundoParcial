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
 * POST /api/v1/viajes/{viajeId}/intervencion (spec 011): solo el despachador, con el viaje en REQUIERE_INTERVENCION y
 * el workflow esperando. Envía {@code resolverIntervencion} con {@code resueltoPor = sub}.
 */
public class ResolucionDeIntervencion extends SenalDeSaga {
    public static final String OPERACION = "RESOLVER_INTERVENCION";
    private final ServicioRepositorio servicios;

    public ResolucionDeIntervencion(
            ServicioRepositorio servicios,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Orquestador orquestador) {
        super(idempotencia, auditoria, tx, orquestador);
        this.servicios = servicios;
    }

    public void ejecutar(Solicitante quien, UUID viajeId, String opcion, String nota, UUID clave, String hashCuerpo) {
        Map<String, Object> datos = new LinkedHashMap<>();
        datos.put("opcion", opcion);
        if (nota != null) datos.put("nota", nota);
        enviarUnaVez(
                clave,
                OPERACION,
                hashCuerpo,
                () -> {
                    if (!quien.tiene("despachador")) {
                        throw new ErrorDeDominio("SIN_PERMISO", "Solo el despachador resuelve una intervención");
                    }
                    if ("MARCAR_RESUELTO".equals(opcion) && (nota == null || nota.isBlank())) {
                        throw new ErrorDeDominio(
                                "VALIDACION",
                                "nota: es obligatoria para marcar como resuelto",
                                Map.of("campo", "nota"));
                    }
                    var servicio = servicios
                            .porViajeId(viajeId)
                            .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
                    var f = servicios.conViaje(servicio.servicioId()).orElseThrow();
                    if (f.estado() != EstadoViaje.REQUIERE_INTERVENCION) {
                        throw new ErrorDeDominio("CONFLICTO_ESTADO", "El viaje no requiere intervención");
                    }
                    exigirEtapa(
                            servicio.workflowId(), "REQUIERE_INTERVENCION", "El workflow ya no espera una decisión");
                    orquestador.resolverIntervencion(servicio.workflowId(), opcion, quien.sub(), nota);
                },
                quien,
                "Viaje",
                viajeId,
                datos);
    }
}
