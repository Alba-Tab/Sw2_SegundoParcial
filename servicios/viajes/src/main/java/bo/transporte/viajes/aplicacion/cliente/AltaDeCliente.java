package bo.transporte.viajes.aplicacion.cliente;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente.Estado;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.VinculadorIdentidad;
import bo.transporte.viajes.dominio.cliente.Cliente;
import bo.transporte.viajes.dominio.cliente.DatosCliente;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * POST /api/v1/clientes (spec 001). En una transacción: crea el cliente, deja ClienteActualizado en el Outbox, audita y
 * guarda la operación ya COMPLETADA con la respuesta 201 ({@code vinculado: false}), así un reenvío nunca queda en
 * EN_PROCESO. Después del commit, si tiene cuenta, vincula en Keycloak y marca {@code vinculado}. Comercial registra un
 * cliente sin cuenta y no toca Keycloak.
 */
public class AltaDeCliente {
    public static final String OPERACION = "CREAR_CLIENTE";
    private static final Logger LOG = LoggerFactory.getLogger(AltaDeCliente.class);
    private static final Set<String> SIN_ALTA =
            Set.of("chofer", "despachador", "jefe_flota", "administracion", "gerente", "agente_lectura");

    public record Resultado(ClienteVista cliente, int codigoHttp) {}

    private final ClienteRepositorio clientes;
    private final RegistroDeEventos eventos;
    private final RegistroIdempotente idempotencia;
    private final Auditoria auditoria;
    private final Transacciones tx;
    private final VinculadorIdentidad identidad;
    private final Clock reloj;

    public AltaDeCliente(
            ClienteRepositorio clientes,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            VinculadorIdentidad identidad,
            Clock reloj) {
        this.clientes = clientes;
        this.eventos = eventos;
        this.idempotencia = idempotencia;
        this.auditoria = auditoria;
        this.tx = tx;
        this.identidad = identidad;
        this.reloj = reloj;
    }

    public Resultado ejecutar(Solicitante quien, DatosCliente datos, UUID clave, String hashCuerpo) {
        Paso paso;
        try {
            paso = tx.enTransaccion(() -> crear(quien, datos, clave, hashCuerpo));
        } catch (RegistroIdempotente.ClaveRepetida e) {
            // Otra petición con la misma clave ganó la carrera: se responde lo que ella guardó.
            paso = tx.enTransaccion(() -> new Paso(repetida(clave, hashCuerpo), true));
        }
        Resultado r = paso.resultado();
        // Un reenvío recibe la respuesta guardada tal cual (vinculado: false); no se vuelve a vincular (spec 001).
        if (paso.repetida() || !r.cliente().tieneCuenta()) return r;
        return new Resultado(vincular(quien.sub(), r.cliente()), r.codigoHttp());
    }

    /** {@code repetida}: es la respuesta guardada de un envío anterior con la misma clave. */
    private record Paso(Resultado resultado, boolean repetida) {}

    private Paso crear(Solicitante quien, DatosCliente datos, UUID clave, String hashCuerpo) {
        var previa = idempotencia.buscar(clave);
        if (previa.isPresent()) return new Paso(responderGuardada(previa.get(), hashCuerpo), true);

        boolean comercial = quien.tiene("comercial");
        if (!comercial && quien.tieneAlguno(SIN_ALTA)) {
            throw new ErrorDeDominio("SIN_PERMISO", "Un usuario interno no registra clientes");
        }
        if (!comercial) {
            clientes.porSub(quien.sub()).ifPresent(c -> {
                throw new ErrorDeDominio(
                        "CONFLICTO_ESTADO", "El usuario ya tiene un cliente", Map.of("clienteId", c.clienteId()));
            });
        }
        clientes.activoPorNit(datos.nit()).ifPresent(c -> {
            throw new ErrorDeDominio(
                    "CONFLICTO_ESTADO", "Ya existe un cliente activo con ese NIT", Map.of("clienteId", c.clienteId()));
        });

        Cliente cliente = comercial
                ? Cliente.deComercial(quien.sub(), datos, reloj.instant())
                : Cliente.delPortal(quien.sub(), datos, reloj.instant());
        clientes.guardar(cliente);
        eventos.registrar("ClienteActualizado", "viajes.cliente-actualizado.v1", datosDelEvento(cliente));
        auditoria.registrar(
                quien,
                cliente.canal().name(),
                OPERACION,
                "Cliente",
                cliente.clienteId(),
                Map.of("razonSocial", datos.razonSocial(), "nit", datos.nit()));
        ClienteVista vista = ClienteVista.de(cliente);
        idempotencia.guardarCompletada(clave, OPERACION, hashCuerpo, 201, vista);
        return new Paso(new Resultado(vista, 201), false);
    }

    private Resultado repetida(UUID clave, String hashCuerpo) {
        return responderGuardada(idempotencia.buscar(clave).orElseThrow(), hashCuerpo);
    }

    private static Resultado responderGuardada(RegistroIdempotente.Operacion op, String hashCuerpo) {
        if (!op.hashCuerpo().equals(hashCuerpo)) {
            throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
        }
        if (op.estado() == Estado.EN_PROCESO) {
            throw new ErrorDeDominio("IDEMPOTENCIA_EN_PROCESO", "La operación con esa clave sigue en proceso");
        }
        return new Resultado((ClienteVista) op.respuesta(), op.codigoHttp());
    }

    private ClienteVista vincular(String sub, ClienteVista vista) {
        try {
            identidad.vincular(sub, vista.clienteId());
            tx.enTransaccion(() -> {
                clientes.marcarVinculado(vista.clienteId());
                return null;
            });
            return vista.vinculadoA(true);
        } catch (VinculadorIdentidad.IdentidadNoDisponible e) {
            // El cliente queda creado; el portal ofrece "Reintentar vinculación" (spec 001).
            LOG.warn("Keycloak no respondió al vincular {}: {}", vista.clienteId(), e.getMessage());
            return vista;
        }
    }

    /** contratos/eventos/viajes/ClienteActualizado.v1.schema.json#/properties/datos */
    static Map<String, Object> datosDelEvento(Cliente c) {
        var d = c.datos();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("clienteId", c.clienteId().toString());
        m.put("versionAgregado", c.versionAgregado());
        m.put("razonSocial", d.razonSocial());
        m.put("nit", d.nit());
        m.put("correo", d.correo());
        m.put("telefono", d.telefono());
        m.put("direccion", d.direccion());
        m.put("canal", c.canal().name());
        m.put("tieneCuenta", c.tieneCuenta());
        m.put("activo", c.activo());
        return m;
    }
}
