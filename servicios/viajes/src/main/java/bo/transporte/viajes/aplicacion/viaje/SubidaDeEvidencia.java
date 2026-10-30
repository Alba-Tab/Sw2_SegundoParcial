package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias.Parte;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias.UrlFirmada;
import bo.transporte.viajes.aplicacion.puerto.salida.EvidenciaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.viaje.Evidencia;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Evidencias subidas por partes (spec 006, D40a): el chofer asignado abre la subida, sube cada parte con su URL firmada,
 * pide URL nuevas para las que faltan si vencieron y la completa. La autoridad de idempotencia es el
 * {@code evidenciaId}. Ver la evidencia depende del rol y del tipo.
 */
public class SubidaDeEvidencia {
    private static final Set<String> VEN_TODAS = Set.of("despachador", "comercial", "gerente");
    private static final Set<Evidencia.Tipo> VE_EL_CLIENTE =
            Set.of(Evidencia.Tipo.FOTO_ENTREGA, Evidencia.Tipo.FIRMA, Evidencia.Tipo.FOTO_RECHAZO);

    public record Subida(UUID evidenciaId, boolean completa, List<UrlFirmada> partes, List<Parte> subidas) {}

    public record Vista(Evidencia evidencia, UrlFirmada descarga) {}

    private final ViajeRepositorio viajes;
    private final EvidenciaRepositorio evidencias;
    private final AlmacenEvidencias almacen;
    private final Transacciones tx;

    public SubidaDeEvidencia(
            ViajeRepositorio viajes, EvidenciaRepositorio evidencias, AlmacenEvidencias almacen, Transacciones tx) {
        this.viajes = viajes;
        this.evidencias = evidencias;
        this.almacen = almacen;
        this.tx = tx;
    }

    public Subida crear(
            Solicitante quien, UUID viajeId, UUID evidenciaId, Evidencia.Tipo tipo, String contentType, long tamano) {
        Viaje v = delChofer(quien, viajeId);
        var previa = evidencias.porId(evidenciaId);
        if (previa.isPresent()) {
            if (!previa.get().mismosDatos(viajeId, tipo, contentType, tamano)) {
                throw new ErrorDeDominio(
                        "IDEMPOTENCIA_CUERPO_DISTINTO", "Ya existe una evidencia con ese id y otros datos");
            }
            return estado(previa.get());
        }
        Evidencia.exigirEstado(tipo, v.estado());
        var nueva = new Evidencia(evidenciaId, viajeId, tipo, contentType, tamano, "pendiente", false);
        String uploadId = almacen(() -> almacen.iniciar(nueva.llave(), contentType));
        var e = new Evidencia(evidenciaId, viajeId, tipo, contentType, tamano, uploadId, false);
        // Si otra petición con el mismo id ganó, su subida es la que vale; esta queda abandonada (D67 la aborta).
        if (!tx.enTransaccion(() -> evidencias.insertar(e)))
            return estado(evidencias.porId(evidenciaId).orElseThrow());
        var numeros = IntStream.rangeClosed(1, e.numeroDePartes()).boxed().toList();
        return new Subida(
                evidenciaId, false, almacen(() -> almacen.urlsDePartes(e.llave(), uploadId, numeros)), List.of());
    }

    public Subida partes(Solicitante quien, UUID viajeId, UUID evidenciaId) {
        delChofer(quien, viajeId);
        return estado(propia(viajeId, evidenciaId));
    }

    public Evidencia completar(Solicitante quien, UUID viajeId, UUID evidenciaId, List<Parte> partes) {
        delChofer(quien, viajeId);
        Evidencia e = propia(viajeId, evidenciaId);
        if (e.completa()) return e;
        var numeros = partes.stream().map(Parte::numero).collect(Collectors.toSet());
        if (numeros.size() != partes.size() || numeros.size() != e.numeroDePartes()) {
            throw new ErrorDeDominio(
                    "VALIDACION",
                    "partes: se esperaban " + e.numeroDePartes() + " partes distintas",
                    Map.of("campo", "partes"));
        }
        long tamano;
        try {
            tamano = almacen(() -> almacen.completar(e.llave(), e.uploadId(), partes));
        } catch (AlmacenEvidencias.PartesInvalidas x) {
            throw new ErrorDeDominio("VALIDACION", "partes: " + x.getMessage(), Map.of("campo", "partes"));
        }
        if (tamano != e.tamanoBytes()) {
            throw new ErrorDeDominio(
                    "VALIDACION",
                    "tamanoBytes: se declararon " + e.tamanoBytes() + " y llegaron " + tamano,
                    Map.of("campo", "tamanoBytes"));
        }
        tx.enTransaccion(() -> {
            evidencias.marcarCompleta(evidenciaId);
            return null;
        });
        return new Evidencia(e.evidenciaId(), e.viajeId(), e.tipo(), e.contentType(), tamano, e.uploadId(), true);
    }

    public Vista obtener(Solicitante quien, UUID viajeId, UUID evidenciaId) {
        Viaje v = viajes.porId(viajeId).orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        Evidencia e = propia(viajeId, evidenciaId);
        boolean puede = quien.tieneAlguno(VEN_TODAS)
                || (quien.tiene("chofer") && quien.sub().equals(v.choferUsuarioSub()))
                || (quien.tiene("cliente")
                        && v.clienteId().equals(quien.clienteId())
                        && VE_EL_CLIENTE.contains(e.tipo()))
                || (quien.tiene("jefe_flota") && e.tipo() == Evidencia.Tipo.RECIBO_COMBUSTIBLE);
        if (!puede) throw new ErrorDeDominio("SIN_PERMISO", "Sin permiso para ver esta evidencia");
        return new Vista(e, e.completa() ? almacen.urlDeDescarga(e.llave()) : null);
    }

    private Subida estado(Evidencia e) {
        if (e.completa()) return new Subida(e.evidenciaId(), true, List.of(), List.of());
        var subidas = almacen(() -> almacen.partesSubidas(e.llave(), e.uploadId()));
        var tiene = subidas.stream().map(Parte::numero).collect(Collectors.toSet());
        var faltan = IntStream.rangeClosed(1, e.numeroDePartes())
                .filter(n -> !tiene.contains(n))
                .boxed()
                .toList();
        return new Subida(
                e.evidenciaId(), false, almacen(() -> almacen.urlsDePartes(e.llave(), e.uploadId(), faltan)), subidas);
    }

    private Viaje delChofer(Solicitante quien, UUID viajeId) {
        if (!quien.tiene("chofer")) throw new ErrorDeDominio("SIN_PERMISO", "Solo el chofer asignado sube evidencias");
        Viaje v = viajes.porId(viajeId).orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        if (!quien.sub().equals(v.choferUsuarioSub())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El viaje es de otro chofer");
        }
        return v;
    }

    private Evidencia propia(UUID viajeId, UUID evidenciaId) {
        return evidencias
                .porId(evidenciaId)
                .filter(e -> e.viajeId().equals(viajeId))
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe la evidencia"));
    }

    private static <T> T almacen(java.util.function.Supplier<T> llamada) {
        try {
            return llamada.get();
        } catch (AlmacenEvidencias.NoDisponible e) {
            throw new ErrorDeDominio("DEPENDENCIA_NO_DISPONIBLE", "El almacén de evidencias no responde");
        }
    }
}
