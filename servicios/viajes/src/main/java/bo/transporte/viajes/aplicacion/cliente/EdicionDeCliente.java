package bo.transporte.viajes.aplicacion.cliente;

import bo.transporte.viajes.aplicacion.comun.OperacionIdempotente;
import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * PUT /api/v1/clientes/{clienteId} (G7, D104): comercial o gerente corrigen razón social, NIT y correo con las reglas
 * del alta (spec 001). En una transacción, con la fila bloqueada: sube {@code versionAgregado}, audita y deja
 * ClienteActualizado en el Outbox, porque NIT y correo viajan a Finanzas (facturas, avisos) y Analítica.
 */
public class EdicionDeCliente {
    public static final String OPERACION = "EDITAR_CLIENTE";
    private static final Set<String> EDITAN = Set.of("comercial", "gerente");

    private final ClienteRepositorio clientes;
    private final RegistroDeEventos eventos;
    private final Auditoria auditoria;
    private final OperacionIdempotente operacion;

    public EdicionDeCliente(
            ClienteRepositorio clientes,
            RegistroDeEventos eventos,
            Auditoria auditoria,
            OperacionIdempotente operacion) {
        this.clientes = clientes;
        this.eventos = eventos;
        this.auditoria = auditoria;
        this.operacion = operacion;
    }

    public ClienteVista ejecutar(
            Solicitante quien,
            UUID clienteId,
            String razonSocial,
            String nit,
            String correo,
            UUID clave,
            String hashCuerpo) {
        if (!quien.tieneAlguno(EDITAN)) {
            throw new ErrorDeDominio("SIN_PERMISO", "Solo atención comercial y el gerente editan clientes");
        }
        return operacion
                .ejecutar(OPERACION, clave, hashCuerpo, 200, () -> {
                    var actual = clientes.paraActualizar(clienteId)
                            .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "El cliente no existe"));
                    var editado = actual.editado(razonSocial, nit, correo);
                    clientes.activoPorNit(editado.datos().nit())
                            .filter(otro -> !otro.clienteId().equals(clienteId))
                            .ifPresent(otro -> {
                                throw new ErrorDeDominio(
                                        "CONFLICTO_ESTADO",
                                        "Ya existe un cliente activo con ese NIT",
                                        Map.of("clienteId", otro.clienteId()));
                            });
                    clientes.actualizar(editado);
                    eventos.registrar(
                            "ClienteActualizado",
                            "viajes.cliente-actualizado.v1",
                            AltaDeCliente.datosDelEvento(editado));
                    auditoria.registrar(
                            quien,
                            "CENTRO_CONTROL",
                            OPERACION,
                            "Cliente",
                            clienteId,
                            Map.of(
                                    "razonSocial", editado.datos().razonSocial(),
                                    "nit", editado.datos().nit(),
                                    "versionAgregado", editado.versionAgregado()));
                    return ClienteVista.de(editado);
                })
                .respuesta();
    }
}
