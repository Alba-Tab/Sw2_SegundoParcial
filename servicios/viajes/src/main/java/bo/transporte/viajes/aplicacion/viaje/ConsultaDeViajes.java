package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * GET /viajes/mios y /viajes/{id} (spec 005). El chofer ve solo los suyos (D50: activos y los terminados en los
 * últimos 7 días); el personal interno de lectura ve todos. Un viaje sin asignación (antes del pivote) no se muestra.
 */
public class ConsultaDeViajes {
    private static final Set<String> VEN_TODOS =
            Set.of("despachador", "comercial", "gerente", "jefe_flota", "agente_lectura");
    private static final Duration TERMINADOS_RECIENTES = Duration.ofDays(7);

    private final ViajeRepositorio viajes;
    private final ClienteRepositorio clientes;
    private final RutaRepositorio rutas;
    private final Clock reloj;

    public ConsultaDeViajes(ViajeRepositorio viajes, ClienteRepositorio clientes, RutaRepositorio rutas, Clock reloj) {
        this.viajes = viajes;
        this.clientes = clientes;
        this.rutas = rutas;
        this.reloj = reloj;
    }

    public List<ViajeVista> mios(Solicitante quien) {
        if (!quien.tiene("chofer")) throw new ErrorDeDominio("SIN_PERMISO", "Solo un chofer tiene viajes propios");
        return viajes.deChofer(quien.sub(), reloj.instant().minus(TERMINADOS_RECIENTES)).stream()
                .map(this::vista)
                .toList();
    }

    public ViajeVista porId(Solicitante quien, UUID viajeId) {
        Viaje v = viajes.porId(viajeId)
                .filter(x -> x.asignacion() != null)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        boolean suyo = quien.tiene("chofer") && quien.sub().equals(v.choferUsuarioSub());
        if (!suyo && !quien.tieneAlguno(VEN_TODOS)) {
            throw new ErrorDeDominio("SIN_PERMISO", "El viaje es de otro chofer");
        }
        return vista(v);
    }

    ViajeVista vista(Viaje v) {
        String razonSocial =
                clientes.porId(v.clienteId()).map(c -> c.datos().razonSocial()).orElse("");
        var ruta = rutas.porId(v.asignacion().rutaId()).orElseThrow();
        return ViajeVista.de(v, razonSocial, ruta);
    }
}
