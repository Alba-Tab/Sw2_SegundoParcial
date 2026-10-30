package bo.transporte.viajes.aplicacion.servicio;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * GET /servicios y /servicios/{id} (spec 003). Un cliente ve solo los suyos; comercial, despachador, administración y
 * gerente ven todos. En PROGRAMANDO se pregunta la etapa al workflow; si no responde, {@code DESCONOCIDA}.
 */
public class ConsultaDeServicios {
    private static final Set<String> VEN_TODOS = Set.of("comercial", "despachador", "administracion", "gerente");
    private static final Set<String> ETAPAS = Set.of(
            "INICIANDO",
            "VALIDANDO_CREDITO",
            "ESPERANDO_APROBACION",
            "RESERVANDO_UNIDAD",
            "CONFIRMANDO",
            "COMPENSANDO");

    public record Pagina(List<ServicioVista> items, UUID ultimo) {}

    private final ServicioRepositorio servicios;
    private final Orquestador orquestador;
    private final UltimaPosicionRepositorio posiciones;

    public ConsultaDeServicios(
            ServicioRepositorio servicios, Orquestador orquestador, UltimaPosicionRepositorio posiciones) {
        this.servicios = servicios;
        this.orquestador = orquestador;
        this.posiciones = posiciones;
    }

    public ServicioVista porId(Solicitante quien, UUID servicioId) {
        var f = servicios
                .conViaje(servicioId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el servicio"));
        if (!quien.tieneAlguno(VEN_TODOS) && !f.servicio().clienteId().equals(quien.clienteId())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El servicio es de otro cliente");
        }
        String etapa = null;
        if (f.estado() == EstadoViaje.PROGRAMANDO) {
            etapa = orquestador
                    .etapa(f.servicio().workflowId())
                    .filter(ETAPAS::contains)
                    .orElse("DESCONOCIDA");
        }
        // Spec 005: el cliente sigue su viaje en ruta con la última posición del mapa.
        var ultima = f.estado() == EstadoViaje.EN_RUTA
                ? posiciones.de(f.servicio().viajeId()).orElse(null)
                : null;
        return ServicioVista.de(f, etapa, ultima);
    }

    public Pagina listar(Solicitante quien, UUID clienteId, EstadoViaje estado, UUID antesDe, int limite) {
        UUID filtro;
        if (quien.tieneAlguno(VEN_TODOS)) filtro = clienteId;
        else if (quien.tiene("cliente") && quien.clienteId() != null) filtro = quien.clienteId();
        else throw new ErrorDeDominio("SIN_PERMISO", "No puede listar servicios");
        var filas = servicios.listar(filtro, estado, antesDe, limite + 1);
        var items =
                filas.stream().limit(limite).map(f -> ServicioVista.de(f, null)).toList();
        return new Pagina(
                items, filas.size() > limite ? items.getLast().servicio().servicioId() : null);
    }
}
