package bo.transporte.viajes.aplicacion.servicio;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio.ConViaje;
import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio.UltimaPosicion;
import bo.transporte.viajes.dominio.viaje.Asignacion;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Servicio;
import java.util.Set;

/** Servicio con el estado de su viaje; {@code etapa} solo en PROGRAMANDO y {@code asignacion} desde el pivote. */
public record ServicioVista(
        Servicio servicio,
        EstadoViaje estado,
        String etapa,
        String motivo,
        Asignacion asignacion,
        java.time.Instant iniciadoEn,
        java.time.Instant entregadoEn,
        java.util.UUID facturaId,
        String numeroFactura,
        UltimaPosicion ultimaPosicion) {
    /** Propuesta 7.2: despachador, jefe de flota, chofer y agente no ven finanzas (contratos/openapi/viajes.yaml). */
    static final Set<String> VEN_FINANZAS = Set.of("gerente", "administracion", "comercial");

    static ServicioVista de(ConViaje f, String etapa) {
        return de(f, etapa, null);
    }

    static ServicioVista de(ConViaje f, String etapa, UltimaPosicion ultimaPosicion) {
        var v = f.viaje();
        return new ServicioVista(
                f.servicio(),
                f.estado(),
                etapa,
                v == null ? null : v.motivo(),
                v == null ? null : v.asignacion(),
                v == null ? null : v.iniciadoEn(),
                v == null ? null : v.entregadoEn(),
                v == null ? null : v.facturaId(),
                v == null ? null : v.numeroFactura(),
                ultimaPosicion);
    }

    /**
     * Lo que el solicitante puede ver: el monto y la factura solo para gerente, administración, comercial y el cliente
     * dueño del servicio. El Gateway los oculta con {@code @roles}, pero un token con audiencia viajes no pasa por él.
     */
    ServicioVista para(Solicitante quien) {
        boolean dueno = quien.tiene("cliente") && servicio.clienteId().equals(quien.clienteId());
        if (dueno || quien.tieneAlguno(VEN_FINANZAS)) return this;
        var a = asignacion;
        var sinMonto = a == null
                ? null
                : new Asignacion(
                        a.rutaId(),
                        a.tipoCarga(),
                        a.toneladas(),
                        a.fechaViaje(),
                        null,
                        a.reservaUnidadId(),
                        a.tractoId(),
                        a.remolqueId(),
                        a.placa(),
                        a.choferId(),
                        a.choferNombre(),
                        a.choferUsuarioSub());
        return new ServicioVista(
                servicio, estado, etapa, motivo, sinMonto, iniciadoEn, entregadoEn, null, null, ultimaPosicion);
    }
}
