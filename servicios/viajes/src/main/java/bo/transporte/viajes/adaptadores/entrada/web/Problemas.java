package bo.transporte.viajes.adaptadores.entrada.web;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/** Problem Details (RFC 9457) con {@code codigo} y {@code correlationId} (000 §5). */
public final class Problemas {
    private Problemas() {}

    /** Estado HTTP de cada código de 000 §5. */
    private static final Map<String, HttpStatus> ESTADOS = Map.ofEntries(
            Map.entry("VALIDACION", HttpStatus.BAD_REQUEST),
            Map.entry("NO_AUTENTICADO", HttpStatus.UNAUTHORIZED),
            Map.entry("SIN_PERMISO", HttpStatus.FORBIDDEN),
            Map.entry("COTIZACION_AJENA", HttpStatus.FORBIDDEN),
            Map.entry("NO_ENCONTRADO", HttpStatus.NOT_FOUND),
            Map.entry("CONFLICTO_ESTADO", HttpStatus.CONFLICT),
            Map.entry("VERSION_DESACTUALIZADA", HttpStatus.CONFLICT),
            Map.entry("IDEMPOTENCIA_EN_PROCESO", HttpStatus.CONFLICT),
            Map.entry("CONFIRMACION_EN_CURSO", HttpStatus.CONFLICT),
            Map.entry("CANCELACION_NO_PERMITIDA", HttpStatus.CONFLICT),
            Map.entry("IDEMPOTENCIA_CUERPO_DISTINTO", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("COTIZACION_VENCIDA", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("CREDITO_INSUFICIENTE", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("CREDITO_RECHAZADO", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("SIN_UNIDAD_COMPATIBLE", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("TONELAJE_EXCEDIDO", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("APROBACION_VENCIDA", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("EVIDENCIA_INCOMPLETA", HttpStatus.UNPROCESSABLE_CONTENT),
            Map.entry("CLIENTE_NO_REPLICADO", HttpStatus.SERVICE_UNAVAILABLE),
            Map.entry("DEPENDENCIA_NO_DISPONIBLE", HttpStatus.SERVICE_UNAVAILABLE),
            Map.entry("ERROR_INTERNO", HttpStatus.INTERNAL_SERVER_ERROR),
            Map.entry("VINCULACION_PENDIENTE", HttpStatus.SERVICE_UNAVAILABLE));

    /** Título legible (000 §5); el código va en {@code codigo}. */
    public static String titulo(String codigo) {
        return switch (estado(codigo)) {
            case BAD_REQUEST -> "Petición inválida";
            case UNAUTHORIZED -> "No autenticado";
            case FORBIDDEN -> "Sin permiso";
            case NOT_FOUND -> "No encontrado";
            case CONFLICT -> "Conflicto con el estado actual";
            case SERVICE_UNAVAILABLE -> "Dependencia no disponible";
            case INTERNAL_SERVER_ERROR -> "Error interno";
            default -> "Regla de negocio no cumplida";
        };
    }

    public static HttpStatus estado(String codigo) {
        return ESTADOS.getOrDefault(codigo, HttpStatus.UNPROCESSABLE_CONTENT);
    }

    public static ProblemDetail de(String codigo, String titulo, String detalle) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(estado(codigo), detalle);
        p.setType(URI.create("https://transporte.local/errores/"
                + codigo.toLowerCase(Locale.ROOT).replace('_', '-')));
        p.setTitle(titulo);
        p.setProperty("codigo", codigo);
        String correlacion = MDC.get(CorrelacionFiltro.MDC_CLAVE);
        if (correlacion != null) p.setProperty("correlationId", correlacion);
        return p;
    }

    public record ErrorDeCampo(String campo, String mensaje) {}

    public static ProblemDetail validacion(List<ErrorDeCampo> errores) {
        ProblemDetail p = de("VALIDACION", "Petición inválida", "Revisa los campos indicados");
        p.setProperty("errores", errores);
        return p;
    }
}
