package bo.transporte.viajes.aplicacion.puerto.salida;

import bo.transporte.viajes.dominio.cliente.Cliente;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClienteRepositorio {
    void guardar(Cliente cliente);

    void marcarVinculado(UUID clienteId);

    Optional<Cliente> porId(UUID clienteId);

    Optional<Cliente> porSub(String sub);

    /** Un cliente activo con ese NIT (el NIT es único entre clientes activos). */
    Optional<Cliente> activoPorNit(String nit);

    /** Página ordenada por clienteId (UUIDv7: por fecha de alta), filtrada por razón social o NIT. */
    List<Cliente> listar(String texto, UUID despuesDe, int limite);
}
