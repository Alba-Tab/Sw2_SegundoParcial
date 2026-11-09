package bo.transporte.viajes.aplicacion.servicio;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio.ConViaje;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.aplicacion.viaje.EventosDeViaje;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * POST /api/v1/servicios/{servicioId}/cancelacion (spec 004, D17). Coreografía: en una transacción el viaje pasa a
 * CANCELADO, se audita y queda ViajeCancelado (origen USUARIO) en el Outbox; Finanzas y Flota liberan por su cuenta.
 * Solo con CONFIRMADO y {@code confirmacionCompleta}; antes, CONFIRMACION_EN_CURSO; en ruta, CANCELACION_NO_PERMITIDA.
 */
public class CancelacionDeServicio {
    public static final String OPERACION = "CANCELAR_SERVICIO";
    public static final String MOTIVO = "CANCELADO_POR_USUARIO";
    private static final Set<String> CANCELAN_CUALQUIERA = Set.of("comercial", "despachador");

    private final ServicioRepositorio servicios;
    private final ViajeRepositorio viajes;
    private final RegistroDeEventos eventos;
    private final RegistroIdempotente idempotencia;
    private final Auditoria auditoria;
    private final Transacciones tx;

    public CancelacionDeServicio(
            ServicioRepositorio servicios,
            ViajeRepositorio viajes,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx) {
        this.servicios = servicios;
        this.viajes = viajes;
        this.eventos = eventos;
        this.idempotencia = idempotencia;
        this.auditoria = auditoria;
        this.tx = tx;
    }

    public ServicioVista ejecutar(Solicitante quien, UUID servicioId, String motivo, UUID clave, String hashCuerpo) {
        ServicioVista vista;
        try {
            vista = tx.enTransaccion(() -> cancelar(quien, servicioId, motivo, clave, hashCuerpo));
        } catch (RegistroIdempotente.ClaveRepetida e) {
            vista = tx.enTransaccion(() -> guardada(clave, hashCuerpo));
        }
        // Se guarda la vista completa; el despachador la recibe sin monto ni factura (propuesta 7.2).
        return vista.para(quien);
    }

    private ServicioVista cancelar(Solicitante quien, UUID servicioId, String motivo, UUID clave, String hashCuerpo) {
        if (idempotencia.buscar(clave).isPresent()) return guardada(clave, hashCuerpo);
        boolean esCliente = quien.tiene("cliente") && quien.clienteId() != null;
        if (!esCliente && !quien.tieneAlguno(CANCELAN_CUALQUIERA)) {
            throw new ErrorDeDominio("SIN_PERMISO", "Solo el cliente, atención comercial o el despachador cancelan");
        }
        var f = servicios
                .conViaje(servicioId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el servicio"));
        if (!quien.tieneAlguno(CANCELAN_CUALQUIERA) && !f.servicio().clienteId().equals(quien.clienteId())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El servicio es de otro cliente");
        }
        // Se relee el viaje con su fila bloqueada: la saga o un consumidor pudieron cambiarlo entre tanto.
        var viaje = f.viaje() == null
                ? null
                : viajes.paraActualizar(f.viaje().viajeId()).orElse(null);
        EstadoViaje estado = viaje == null ? EstadoViaje.PROGRAMANDO : viaje.estado();
        switch (estado) {
            case PROGRAMANDO ->
                throw new ErrorDeDominio("CONFIRMACION_EN_CURSO", "El servicio todavía se está confirmando");
            case CONFIRMADO -> {
                if (!f.servicio().confirmacionCompleta()) {
                    throw new ErrorDeDominio("CONFIRMACION_EN_CURSO", "La confirmación del servicio sigue en curso");
                }
            }
            case EN_RUTA, ENTREGA_OBSERVADA ->
                throw new ErrorDeDominio(
                        "CANCELACION_NO_PERMITIDA", "El viaje ya está en ruta; llame a atención comercial");
            default ->
                throw new ErrorDeDominio("CONFLICTO_ESTADO", "El servicio está " + estado + " y no se puede cancelar");
        }

        viaje.cancelar(MOTIVO, motivo);
        viajes.actualizar(viaje);
        eventos.registrar(
                "ViajeCancelado",
                "viajes.viaje-cancelado.v1",
                EventosDeViaje.cancelado(viaje, EstadoViaje.CONFIRMADO, "USUARIO", quien.sub()));
        String canal = esCliente ? "PORTAL" : quien.tiene("comercial") ? "TELEFONO" : "CENTRO_CONTROL";
        auditoria.registrar(quien, canal, OPERACION, "Servicio", servicioId, Map.of("motivo", motivo));
        var vista = ServicioVista.de(new ConViaje(f.servicio(), viaje), null);
        idempotencia.guardarCompletada(clave, OPERACION, hashCuerpo, 200, vista);
        return vista;
    }

    private ServicioVista guardada(UUID clave, String hashCuerpo) {
        var op = idempotencia.buscar(clave).orElseThrow();
        if (!op.hashCuerpo().equals(hashCuerpo) || !OPERACION.equals(op.tipo())) {
            throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
        }
        return (ServicioVista) op.respuesta();
    }
}
