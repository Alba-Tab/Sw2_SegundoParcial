package bo.transporte.viajes.aplicacion.cliente;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.VinculadorIdentidad;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;

/**
 * POST /api/v1/clientes/mio/vinculacion (spec 001): repite solo la escritura de {@code clienteId} y del rol en
 * Keycloak. Es idempotente por sí misma, así que la clave no se guarda. Keycloak caído → 503 VINCULACION_PENDIENTE.
 */
public class VinculacionDeCliente {
    private final ClienteRepositorio clientes;
    private final VinculadorIdentidad identidad;
    private final Transacciones tx;

    public VinculacionDeCliente(ClienteRepositorio clientes, VinculadorIdentidad identidad, Transacciones tx) {
        this.clientes = clientes;
        this.identidad = identidad;
        this.tx = tx;
    }

    public ClienteVista reintentar(Solicitante quien) {
        var cliente = clientes.porSub(quien.sub())
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "El usuario no tiene cliente"));
        if (cliente.vinculado()) return ClienteVista.de(cliente);
        try {
            identidad.vincular(quien.sub(), cliente.clienteId());
        } catch (VinculadorIdentidad.IdentidadNoDisponible e) {
            throw new ErrorDeDominio(
                    "VINCULACION_PENDIENTE", "Keycloak no responde; vuelve a intentar en unos segundos");
        }
        tx.enTransaccion(() -> {
            clientes.marcarVinculado(cliente.clienteId());
            return null;
        });
        cliente.marcarVinculado();
        return ClienteVista.de(cliente);
    }
}
