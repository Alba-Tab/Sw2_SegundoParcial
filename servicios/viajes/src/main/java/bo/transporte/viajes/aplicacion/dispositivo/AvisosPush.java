package bo.transporte.viajes.aplicacion.dispositivo;

import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush;
import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush.Mensaje;
import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush.Resultado;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Avisos push al chofer (D45, specs 003, 004 y 007): viaje asignado, viaje cancelado por el cliente o por atención
 * comercial (solo {@code origen = USUARIO}) y la decisión del despachador sobre una entrega observada. Lo llama el
 * consumidor interno del Outbox después del commit; cada evento se avisa una sola vez.
 */
public class AvisosPush {
    public static final Set<String> TIPOS =
            Set.of("ViajeConfirmado", "ViajeCancelado", "EntregaConfirmada", "EntregaRechazada");

    record Aviso(String titulo, String cuerpo) {}

    private final ViajeRepositorio viajes;
    private final DispositivoRepositorio dispositivos;
    private final NotificadorPush notificador;

    public AvisosPush(ViajeRepositorio viajes, DispositivoRepositorio dispositivos, NotificadorPush notificador) {
        this.viajes = viajes;
        this.dispositivos = dispositivos;
        this.notificador = notificador;
    }

    /** Qué aviso corresponde al evento; vacío si no se avisa (p. ej. una cancelación de la saga). */
    static Optional<Aviso> avisoDe(String tipo, Map<String, Object> datos) {
        return switch (tipo) {
            case "ViajeConfirmado" ->
                Optional.of(new Aviso("Viaje asignado", "Tienes un viaje nuevo con la unidad " + datos.get("placa")));
            case "ViajeCancelado" ->
                "USUARIO".equals(datos.get("origen"))
                        ? Optional.of(new Aviso("Viaje cancelado", "El cliente canceló el viaje; no salgas"))
                        : Optional.empty();
            case "EntregaConfirmada" ->
                datos.get("aprobadaPor") != null
                        ? Optional.of(new Aviso("Entrega aprobada", "El despachador aprobó tu entrega observada"))
                        : Optional.empty();
            case "EntregaRechazada" ->
                "DESPACHADOR".equals(datos.get("origenRechazo"))
                        ? Optional.of(new Aviso(
                                "Entrega rechazada", "El despachador rechazó la entrega: " + datos.get("motivo")))
                        : Optional.empty();
            default -> Optional.empty();
        };
    }

    /** Devuelve el resultado guardado; null si otra instancia ya procesó el evento. */
    public String procesar(UUID eventoId, String tipo, Map<String, Object> datos) {
        var aviso = avisoDe(tipo, datos);
        String viajeId = String.valueOf(datos.get("viajeId"));
        String sub = aviso.isEmpty() ? null : choferDe(datos, viajeId);
        var tokens = sub == null ? java.util.List.<String>of() : dispositivos.tokensPush(sub);
        String inicial = aviso.isEmpty() ? "NO_APLICA" : tokens.isEmpty() ? "SIN_DISPOSITIVO" : "ENVIANDO";
        if (!dispositivos.registrarAviso(eventoId, tipo, inicial)) return null;
        if (!"ENVIANDO".equals(inicial)) return inicial;

        // collapse_key = viajeId: si llegan dos avisos del mismo viaje sin señal, el celular muestra el último.
        var mensaje = new Mensaje(
                aviso.get().titulo(), aviso.get().cuerpo(), Map.of("viajeId", viajeId, "tipo", tipo), viajeId);
        Resultado peor = Resultado.OMITIDO;
        for (String token : tokens) {
            Resultado r = notificador.enviar(token, mensaje);
            if (r == Resultado.TOKEN_INVALIDO) dispositivos.olvidarToken(token);
            if (r == Resultado.ENVIADO || peor == Resultado.OMITIDO) peor = r;
        }
        dispositivos.actualizarAviso(eventoId, peor.name());
        return peor.name();
    }

    private String choferDe(Map<String, Object> datos, String viajeId) {
        Object sub = datos.get("choferUsuarioSub");
        if (sub != null) return sub.toString();
        try {
            return viajes.porId(UUID.fromString(viajeId))
                    .map(v -> v.choferUsuarioSub())
                    .orElse(null);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
