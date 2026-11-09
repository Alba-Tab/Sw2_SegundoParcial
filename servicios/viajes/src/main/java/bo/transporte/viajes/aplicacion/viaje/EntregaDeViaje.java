package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.EntregaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.EvidenciaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import bo.transporte.viajes.dominio.ruta.Ruta;
import bo.transporte.viajes.dominio.viaje.Entrega;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Evidencia;
import bo.transporte.viajes.dominio.viaje.Geocerca;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Entrega del viaje (spec 006) y sus caminos alternativos (spec 007). Cada operación va en una transacción con su clave
 * de idempotencia, la auditoría y el evento en el Outbox: EntregaConfirmada, EntregaObservada o EntregaRechazada.
 * {@code kmRecorridos} es siempre la distancia de la ruta (D07).
 */
public class EntregaDeViaje {
    public static final String ENTREGAR = "REGISTRAR_ENTREGA";
    public static final String RECHAZO_RECEPTOR = "RECHAZO_RECEPTOR";
    public static final String APROBAR = "APROBAR_ENTREGA";
    public static final String RECHAZAR = "RECHAZAR_ENTREGA";
    private static final Set<String> VEN_ENTREGA = Set.of("despachador", "comercial", "gerente");

    public record Firma(UUID evidenciaId, String nombreReceptor) {}

    private final ViajeRepositorio viajes;
    private final EntregaRepositorio entregas;
    private final EvidenciaRepositorio evidencias;
    private final RutaRepositorio rutas;
    private final ConsultaDeViajes consulta;
    private final RegistroDeEventos eventos;
    private final RegistroIdempotente idempotencia;
    private final Auditoria auditoria;
    private final Transacciones tx;
    private final Clock reloj;

    public EntregaDeViaje(
            ViajeRepositorio viajes,
            EntregaRepositorio entregas,
            EvidenciaRepositorio evidencias,
            RutaRepositorio rutas,
            ConsultaDeViajes consulta,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Clock reloj) {
        this.viajes = viajes;
        this.entregas = entregas;
        this.evidencias = evidencias;
        this.rutas = rutas;
        this.consulta = consulta;
        this.eventos = eventos;
        this.idempotencia = idempotencia;
        this.auditoria = auditoria;
        this.tx = tx;
        this.reloj = reloj;
    }

    /** Spec 006: dentro de la geocerca y con firma, ENTREGADO; si no, ENTREGA_OBSERVADA con sus razones (spec 007). */
    public ResultadoEntrega entregar(
            Solicitante quien,
            UUID viajeId,
            UUID entregaId,
            Instant entregadoEn,
            double lat,
            double lng,
            Double precision,
            List<UUID> fotos,
            Firma firma,
            String observacion,
            UUID clave,
            String hash) {
        return idempotente(clave, ENTREGAR, hash, ResultadoEntrega.class, () -> {
            Viaje v = delChofer(quien, viajeId);
            exigirEstado(v, EstadoViaje.EN_RUTA);
            exigirEvidencias(viajeId, fotos, Evidencia.Tipo.FOTO_ENTREGA, "fotos");
            if (firma != null) exigirEvidencias(viajeId, List.of(firma.evidenciaId()), Evidencia.Tipo.FIRMA, "firma");
            Ruta ruta = ruta(v);
            double distancia = distancia(ruta, lat, lng);
            boolean dentro = distancia <= ruta.radioMetros();
            List<String> razones = new ArrayList<>();
            if (!dentro) razones.add("FUERA_GEOCERCA");
            if (firma == null) razones.add("SIN_FIRMA");

            v.entregar(entregadoEn, !razones.isEmpty());
            viajes.actualizar(v);
            var e = new Entrega(
                    entregaId,
                    viajeId,
                    Entrega.Tipo.ENTREGA,
                    entregadoEn,
                    lat,
                    lng,
                    precision,
                    distancia,
                    dentro,
                    firma != null,
                    razones,
                    firma == null ? null : firma.nombreReceptor(),
                    firma == null ? null : firma.evidenciaId(),
                    fotos,
                    observacion,
                    null,
                    null,
                    null);
            entregas.insertar(e);
            if (razones.isEmpty()) {
                eventos.registrar("EntregaConfirmada", "viajes.entrega-confirmada.v1", confirmada(v, e, ruta, null));
            } else {
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("viajeId", viajeId.toString());
                d.put("servicioId", v.servicioId().toString());
                d.put("entregaId", entregaId.toString());
                d.put("razones", razones);
                d.put("distanciaMetros", redondear(distancia));
                d.put("posicion", Map.of("lat", lat, "lng", lng));
                d.put("registradaEn", entregadoEn.toString());
                eventos.registrar("EntregaObservada", "viajes.entrega-observada.v1", d);
            }
            auditoria.registrar(quien, "APP_CHOFER", ENTREGAR, "Viaje", viajeId, Map.of("razones", razones));
            return new ResultadoEntrega(
                    viajeId, entregaId, v.estado(), dentro, redondear(distancia), firma != null, razones);
        });
    }

    /** Spec 007, B: el receptor rechaza la carga; la distancia se guarda pero no se valida (D68). */
    public ResultadoEntrega rechazoReceptor(
            Solicitante quien,
            UUID viajeId,
            UUID entregaId,
            Instant rechazadaEn,
            double lat,
            double lng,
            String motivo,
            List<UUID> fotos,
            UUID clave,
            String hash) {
        return idempotente(clave, RECHAZO_RECEPTOR, hash, ResultadoEntrega.class, () -> {
            Viaje v = delChofer(quien, viajeId);
            exigirEstado(v, EstadoViaje.EN_RUTA);
            exigirEvidencias(viajeId, fotos, Evidencia.Tipo.FOTO_RECHAZO, "fotos");
            Ruta ruta = ruta(v);
            double distancia = distancia(ruta, lat, lng);
            boolean dentro = distancia <= ruta.radioMetros();
            v.rechazarEntrega(EstadoViaje.EN_RUTA);
            viajes.actualizar(v);
            var e = new Entrega(
                    entregaId,
                    viajeId,
                    Entrega.Tipo.RECHAZO_RECEPTOR,
                    rechazadaEn,
                    lat,
                    lng,
                    null,
                    distancia,
                    dentro,
                    false,
                    List.of(),
                    null,
                    null,
                    fotos,
                    null,
                    motivo,
                    null,
                    null);
            entregas.insertar(e);
            eventos.registrar(
                    "EntregaRechazada", "viajes.entrega-rechazada.v1", rechazada(v, e, ruta, "RECEPTOR", rechazadaEn));
            auditoria.registrar(quien, "APP_CHOFER", RECHAZO_RECEPTOR, "Viaje", viajeId, Map.of("motivo", motivo));
            return new ResultadoEntrega(viajeId, entregaId, v.estado(), dentro, redondear(distancia), false, List.of());
        });
    }

    /** Spec 007, paso 5: el despachador aprueba; EntregaConfirmada con lo registrado y {@code aprobadaPor}. */
    public ViajeVista aprobar(Solicitante quien, UUID viajeId, String nota, UUID clave, String hash) {
        return idempotente(clave, APROBAR, hash, ViajeVista.class, () -> {
            var par = observada(quien, viajeId);
            Viaje v = par.viaje();
            v.aprobarEntrega();
            viajes.actualizar(v);
            var e = par.entrega().conDecision("APROBADA", quien.sub(), null);
            entregas.guardarDecision(e);
            eventos.registrar(
                    "EntregaConfirmada", "viajes.entrega-confirmada.v1", confirmada(v, e, ruta(v), quien.sub()));
            Map<String, Object> datos = new LinkedHashMap<>();
            if (nota != null) datos.put("nota", nota);
            auditoria.registrar(quien, "CENTRO_CONTROL", APROBAR, "Viaje", viajeId, datos);
            return consulta.vista(v);
        });
    }

    /** Spec 007, paso 6: el despachador rechaza; EntregaRechazada con origen DESPACHADOR. */
    public ViajeVista rechazar(Solicitante quien, UUID viajeId, String motivo, UUID clave, String hash) {
        return idempotente(clave, RECHAZAR, hash, ViajeVista.class, () -> {
            var par = observada(quien, viajeId);
            Viaje v = par.viaje();
            v.rechazarEntrega(EstadoViaje.ENTREGA_OBSERVADA);
            viajes.actualizar(v);
            var e = par.entrega().conDecision("RECHAZADA", quien.sub(), motivo);
            entregas.guardarDecision(e);
            eventos.registrar(
                    "EntregaRechazada",
                    "viajes.entrega-rechazada.v1",
                    rechazada(v, e, ruta(v), "DESPACHADOR", reloj.instant()));
            auditoria.registrar(quien, "CENTRO_CONTROL", RECHAZAR, "Viaje", viajeId, Map.of("motivo", motivo));
            return consulta.vista(v);
        });
    }

    /** GET .../entrega: chofer propio, cliente del viaje, despachador, comercial y gerente. */
    public Entrega obtener(Solicitante quien, UUID viajeId) {
        Viaje v = viajes.porId(viajeId).orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        boolean puede = quien.tieneAlguno(VEN_ENTREGA)
                || (quien.tiene("chofer") && quien.sub().equals(v.choferUsuarioSub()))
                || (quien.tiene("cliente") && v.clienteId().equals(quien.clienteId()));
        if (!puede) throw new ErrorDeDominio("SIN_PERMISO", "Sin permiso para ver esta entrega");
        return entregas.delViaje(viajeId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "El viaje todavía no tiene entrega"));
    }

    private record Observada(Viaje viaje, Entrega entrega) {}

    private Observada observada(Solicitante quien, UUID viajeId) {
        if (!quien.tiene("despachador")) {
            throw new ErrorDeDominio("SIN_PERMISO", "Solo el despachador decide una entrega observada");
        }
        Viaje v = viajes.paraActualizar(viajeId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        exigirEstado(v, EstadoViaje.ENTREGA_OBSERVADA);
        return new Observada(v, entregas.delViaje(viajeId).orElseThrow());
    }

    private Viaje delChofer(Solicitante quien, UUID viajeId) {
        if (!quien.tiene("chofer")) throw new ErrorDeDominio("SIN_PERMISO", "Solo el chofer asignado entrega");
        Viaje v = viajes.paraActualizar(viajeId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el viaje"));
        if (!quien.sub().equals(v.choferUsuarioSub())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El viaje es de otro chofer");
        }
        return v;
    }

    private static void exigirEstado(Viaje v, EstadoViaje esperado) {
        if (v.estado() != esperado) {
            throw new ErrorDeDominio("CONFLICTO_ESTADO", "El viaje está " + v.estado() + "; se esperaba " + esperado);
        }
    }

    private void exigirEvidencias(UUID viajeId, List<UUID> ids, Evidencia.Tipo tipo, String campo) {
        var halladas = evidencias.porIds(ids);
        boolean validas = halladas.size() == ids.size()
                && halladas.stream().allMatch(e -> e.viajeId().equals(viajeId) && e.tipo() == tipo);
        if (!validas) {
            throw new ErrorDeDominio(
                    "VALIDACION", campo + ": deben ser evidencias " + tipo + " de este viaje", Map.of("campo", campo));
        }
        if (halladas.stream().anyMatch(e -> !e.completa())) {
            throw new ErrorDeDominio("EVIDENCIA_INCOMPLETA", campo + ": hay evidencias que todavía se están subiendo");
        }
    }

    private Ruta ruta(Viaje v) {
        return rutas.porId(v.asignacion().rutaId()).orElseThrow();
    }

    private static double distancia(Ruta r, double lat, double lng) {
        var d = r.destino().coordenadas();
        return Geocerca.distanciaMetros(lat, lng, d.lat(), d.lng());
    }

    private static double redondear(double metros) {
        return Math.round(metros * 10) / 10.0;
    }

    /** contratos/eventos/viajes/EntregaConfirmada.v1 */
    private static Map<String, Object> confirmada(Viaje v, Entrega e, Ruta ruta, String aprobadaPor) {
        var a = v.asignacion();
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("viajeId", v.viajeId().toString());
        d.put("servicioId", v.servicioId().toString());
        d.put("clienteId", v.clienteId().toString());
        d.put("entregaId", e.entregaId().toString());
        d.put("entregadoEn", e.registradaEn().toString());
        d.put("posicion", Map.of("lat", e.lat(), "lng", e.lng()));
        d.put("dentroGeocerca", e.dentroGeocerca());
        d.put("conFirma", e.conFirma());
        if (aprobadaPor != null) d.put("aprobadaPor", aprobadaPor);
        d.put("kmRecorridos", ruta.distanciaKm());
        d.put("tractoId", a.tractoId().toString());
        d.put("remolqueId", a.remolqueId().toString());
        d.put("choferId", a.choferId().toString());
        return d;
    }

    /** contratos/eventos/viajes/EntregaRechazada.v1 */
    private static Map<String, Object> rechazada(Viaje v, Entrega e, Ruta ruta, String origen, Instant en) {
        var a = v.asignacion();
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("viajeId", v.viajeId().toString());
        d.put("servicioId", v.servicioId().toString());
        d.put("clienteId", v.clienteId().toString());
        d.put("entregaId", e.entregaId().toString());
        d.put("origenRechazo", origen);
        d.put("motivo", e.motivo());
        d.put("rechazadaEn", en.toString());
        d.put("kmRecorridos", ruta.distanciaKm());
        d.put("tractoId", a.tractoId().toString());
        d.put("remolqueId", a.remolqueId().toString());
        d.put("choferId", a.choferId().toString());
        return d;
    }

    /** La operación en una transacción con su clave: un reenvío con el mismo cuerpo devuelve la respuesta guardada. */
    private <T> T idempotente(UUID clave, String operacion, String hash, Class<T> tipo, Supplier<T> hacer) {
        Supplier<T> guardada = () -> {
            var op = idempotencia.buscar(clave).orElseThrow();
            if (!op.hashCuerpo().equals(hash) || !operacion.equals(op.tipo())) {
                throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
            }
            return tipo.cast(op.respuesta());
        };
        try {
            return tx.enTransaccion(() -> {
                if (idempotencia.buscar(clave).isPresent()) return guardada.get();
                T r = hacer.get();
                idempotencia.guardarCompletada(clave, operacion, hash, 200, r);
                return r;
            });
        } catch (RegistroIdempotente.ClaveRepetida e) {
            return tx.enTransaccion(guardada);
        }
    }
}
