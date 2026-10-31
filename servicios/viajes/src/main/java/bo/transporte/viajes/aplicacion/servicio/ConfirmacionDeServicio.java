package bo.transporte.viajes.aplicacion.servicio;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente.Estado;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.dominio.comun.CanalServicio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.Servicio;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * POST /api/v1/servicios (spec 003). En una transacción: clave EN_PROCESO y el Servicio con sus ids. Después del commit
 * inicia el workflow y marca la clave COMPLETADA. Un reenvío con la clave en EN_PROCESO vuelve a iniciar el mismo
 * workflowId, que el motor trata como ya iniciado (D43); si Temporal no responde, la clave queda EN_PROCESO y el
 * cliente reenvía.
 */
public class ConfirmacionDeServicio {
    public static final String OPERACION = "CONFIRMAR_SERVICIO";

    private final ServicioRepositorio servicios;
    private final ClienteRepositorio clientes;
    private final RegistroIdempotente idempotencia;
    private final Auditoria auditoria;
    private final Transacciones tx;
    private final Orquestador orquestador;
    private final ParametrosSaga parametros;
    private final Clock reloj;

    public ConfirmacionDeServicio(
            ServicioRepositorio servicios,
            ClienteRepositorio clientes,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Orquestador orquestador,
            ParametrosSaga parametros,
            Clock reloj) {
        this.servicios = servicios;
        this.clientes = clientes;
        this.idempotencia = idempotencia;
        this.auditoria = auditoria;
        this.tx = tx;
        this.orquestador = orquestador;
        this.parametros = parametros;
        this.reloj = reloj;
    }

    /** {@code servicio} es null cuando la operación ya estaba COMPLETADA y no queda nada por hacer. */
    private record Paso(ServicioAceptado aceptado, Servicio servicio) {}

    public ServicioAceptado ejecutar(
            Solicitante quien, UUID cotizacionId, UUID clienteIdCuerpo, UUID clave, String hashCuerpo) {
        Paso paso;
        try {
            paso = tx.enTransaccion(() -> registrar(quien, cotizacionId, clienteIdCuerpo, clave, hashCuerpo));
        } catch (RegistroIdempotente.ClaveRepetida e) {
            // Otra petición con la misma clave ganó la carrera (FS7): se sigue con lo que ella guardó.
            paso = tx.enTransaccion(() -> guardada(clave, hashCuerpo));
        }
        if (paso.servicio() == null) return paso.aceptado();
        try {
            orquestador.iniciar(paso.servicio(), parametros);
        } catch (Orquestador.NoDisponible e) {
            throw new ErrorDeDominio(
                    "DEPENDENCIA_NO_DISPONIBLE", "No se pudo iniciar la programación; reenvíe con la misma clave");
        }
        tx.enTransaccion(() -> {
            idempotencia.completar(clave);
            return null;
        });
        return paso.aceptado();
    }

    /**
     * Inicia la saga de las confirmaciones que siguen EN_PROCESO hace más de {@code antiguedad}: Temporal no respondió
     * y el cliente no reenvió (D43). Mismo workflowId, así que repetirlo es seguro. Devuelve cuántas inició.
     */
    public int reanudarPendientes(Duration antiguedad) {
        int iniciadas = 0;
        for (UUID clave :
                idempotencia.enProcesoAntesDe(OPERACION, reloj.instant().minus(antiguedad), 50)) {
            Servicio s = tx.enTransaccion(() -> idempotencia
                    .buscar(clave)
                    .filter(op -> op.estado() == Estado.EN_PROCESO)
                    .flatMap(op -> servicios.porId(((ServicioAceptado) op.respuesta()).servicioId()))
                    .orElse(null));
            if (s == null) continue;
            try {
                orquestador.iniciar(s, parametros);
            } catch (Orquestador.NoDisponible e) {
                return iniciadas; // Temporal sigue caído: se reintenta en la próxima pasada.
            }
            tx.enTransaccion(() -> {
                idempotencia.completar(clave);
                return null;
            });
            iniciadas++;
        }
        return iniciadas;
    }

    private Paso registrar(Solicitante quien, UUID cotizacionId, UUID clienteIdCuerpo, UUID clave, String hashCuerpo) {
        if (idempotencia.buscar(clave).isPresent()) return guardada(clave, hashCuerpo);

        UUID clienteId;
        CanalServicio canal;
        if (quien.tiene("comercial")) {
            if (clienteIdCuerpo == null) {
                throw new ErrorDeDominio("SIN_PERMISO", "Atención comercial debe indicar el clienteId");
            }
            clientes.porId(clienteIdCuerpo)
                    .filter(c -> c.activo())
                    .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe un cliente activo con ese id"));
            clienteId = clienteIdCuerpo;
            canal = CanalServicio.TELEFONO;
        } else if (quien.tiene("cliente") && quien.clienteId() != null) {
            clienteId = quien.clienteId();
            canal = CanalServicio.PORTAL;
        } else {
            throw new ErrorDeDominio("SIN_PERMISO", "Solo un cliente o atención comercial confirma servicios");
        }

        Servicio s = Servicio.nuevo(clienteId, cotizacionId, canal, quien.sub(), reloj.instant());
        servicios.guardar(s);
        auditoria.registrar(
                quien, canal.name(), OPERACION, "Servicio", s.servicioId(), Map.of("cotizacionId", cotizacionId));
        var aceptado = new ServicioAceptado(s.servicioId(), s.viajeId(), "PROGRAMANDO");
        idempotencia.guardarEnProceso(clave, OPERACION, hashCuerpo, 202, aceptado);
        return new Paso(aceptado, s);
    }

    private Paso guardada(UUID clave, String hashCuerpo) {
        var op = idempotencia.buscar(clave).orElseThrow();
        if (!op.hashCuerpo().equals(hashCuerpo) || !OPERACION.equals(op.tipo())) {
            throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
        }
        var aceptado = (ServicioAceptado) op.respuesta();
        if (op.estado() == Estado.COMPLETADA) return new Paso(aceptado, null);
        // EN_PROCESO (D43): se repite el inicio con el mismo workflowId.
        return new Paso(aceptado, servicios.porId(aceptado.servicioId()).orElseThrow());
    }
}
