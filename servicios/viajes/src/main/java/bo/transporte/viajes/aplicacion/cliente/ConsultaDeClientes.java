package bo.transporte.viajes.aplicacion.cliente;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Lecturas de clientes con los permisos de spec 001 y viajes.yaml (la fila se filtra aquí, no en el menú). */
public class ConsultaDeClientes {
    private static final Set<String> LISTAN = Set.of("comercial", "despachador", "administracion", "gerente");
    private static final Set<String> VEN_CUALQUIERA =
            Set.of("comercial", "despachador", "administracion", "gerente", "agente_lectura");

    public record Pagina(List<ClienteVista> items, UUID ultimo) {}

    private final ClienteRepositorio clientes;

    public ConsultaDeClientes(ClienteRepositorio clientes) {
        this.clientes = clientes;
    }

    public Pagina listar(Solicitante quien, String texto, UUID despuesDe, int limite) {
        if (!quien.tieneAlguno(LISTAN)) throw new ErrorDeDominio("SIN_PERMISO", "Sin permiso para listar clientes");
        var lote = clientes.listar(texto, despuesDe, limite + 1);
        var items = lote.stream().limit(limite).map(ClienteVista::de).toList();
        return new Pagina(items, lote.size() > limite ? items.getLast().clienteId() : null);
    }

    public ClienteVista mio(Solicitante quien) {
        return clientes.porSub(quien.sub())
                .map(ClienteVista::de)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "El usuario no tiene cliente"));
    }

    public ClienteVista porId(Solicitante quien, UUID clienteId) {
        if (quien.tiene("cliente") && !quien.tieneAlguno(VEN_CUALQUIERA)) {
            if (!clienteId.equals(quien.clienteId()))
                throw new ErrorDeDominio("SIN_PERMISO", "Solo puedes ver tu propio cliente");
        } else if (!quien.tieneAlguno(VEN_CUALQUIERA)) {
            throw new ErrorDeDominio("SIN_PERMISO", "Sin permiso para ver clientes");
        }
        return clientes.porId(clienteId)
                .map(ClienteVista::de)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "El cliente no existe"));
    }
}
