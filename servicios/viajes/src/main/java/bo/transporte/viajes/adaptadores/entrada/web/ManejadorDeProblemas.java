package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.List;
import java.util.Map;
import org.apache.tomcat.util.http.InvalidParameterException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.lang.Nullable;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import software.amazon.awssdk.core.exception.SdkException;
import tools.jackson.core.JacksonException;

/** Todo error sale como application/problem+json con su código; nunca trazas de pila ni mensajes de la base. */
@RestControllerAdvice
class ManejadorDeProblemas extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ManejadorDeProblemas.class);
    private static final Map<Integer, String> POR_ESTADO = Map.of(
            400,
            "VALIDACION",
            401,
            "NO_AUTENTICADO",
            403,
            "SIN_PERMISO",
            404,
            "NO_ENCONTRADO",
            405,
            "NO_ENCONTRADO",
            406,
            "VALIDACION",
            409,
            "CONFLICTO_ESTADO",
            413,
            "VALIDACION",
            415,
            "VALIDACION",
            503,
            "DEPENDENCIA_NO_DISPONIBLE");

    private final LimiteCuerpoFiltro limite;

    ManejadorDeProblemas(LimiteCuerpoFiltro limite) {
        this.limite = limite;
    }

    @ExceptionHandler(ErrorDeDominio.class)
    ResponseEntity<ProblemDetail> dominio(ErrorDeDominio e) {
        ProblemDetail p = Problemas.de(e.codigo(), Problemas.titulo(e.codigo()), e.getMessage());
        e.datos().forEach((clave, valor) -> {
            if (!clave.equals("campo")) p.setProperty(clave, valor);
        });
        if (e.codigo().equals("VALIDACION") && e.datos().get("campo") instanceof String campo) {
            p.setProperty("errores", List.of(new Problemas.ErrorDeCampo(campo, e.getMessage())));
        }
        var respuesta = ResponseEntity.status(p.getStatus());
        if (p.getStatus() == 503) respuesta.header(HttpHeaders.RETRY_AFTER, "10");
        return respuesta.body(p);
    }

    /** Parámetros validados por {@code @Validated} en las interfaces generadas (límites, tamaños). */
    @ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
    ProblemDetail restriccion(jakarta.validation.ConstraintViolationException e) {
        var errores = e.getConstraintViolations().stream()
                .map(v -> {
                    String ruta = v.getPropertyPath().toString();
                    return new Problemas.ErrorDeCampo(ruta.substring(ruta.lastIndexOf('.') + 1), v.getMessage());
                })
                .toList();
        return Problemas.validacion(errores);
    }

    /** PostgreSQL, DynamoDB o S3 caídos o saturados: 503 con Retry-After (spec 005), nunca un 500. */
    @ExceptionHandler({TransientDataAccessException.class, DataAccessResourceFailureException.class, SdkException.class
    })
    ResponseEntity<ProblemDetail> noDisponible(Exception e) {
        LOG.warn("Dependencia no disponible: {}", e.toString());
        ProblemDetail p = Problemas.de(
                "DEPENDENCIA_NO_DISPONIBLE",
                Problemas.titulo("DEPENDENCIA_NO_DISPONIBLE"),
                "Una dependencia no respondió; reintenta en unos segundos");
        return ResponseEntity.status(p.getStatus())
                .header(HttpHeaders.RETRY_AFTER, "10")
                .body(p);
    }

    /** Carrera contra un índice único (NIT activo, un viaje en ruta por chofer): la otra petición ganó. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail integridad(DataIntegrityViolationException e) {
        LOG.info("Restricción de la base: {}", e.getMostSpecificCause().getMessage());
        return Problemas.de(
                "CONFLICTO_ESTADO",
                Problemas.titulo("CONFLICTO_ESTADO"),
                "Otra operación cambió el recurso al mismo tiempo; vuelve a consultarlo");
    }

    /**
     * Tomcat no pudo decodificar la consulta (%FF, %A, UTF-8 inválido): lo lanza al leer el primer parámetro y antes
     * era un 500. Es un error del cliente.
     */
    @ExceptionHandler(InvalidParameterException.class)
    ProblemDetail parametroIlegible(InvalidParameterException e) {
        LOG.info("Parámetros ilegibles: {}", e.getMessage());
        return Problemas.de(
                "VALIDACION",
                Problemas.titulo("VALIDACION"),
                "La consulta tiene un parámetro mal codificado; usa UTF-8 y secuencias %XX válidas");
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail inesperado(Exception e) {
        LOG.error("Error no controlado", e);
        return interno();
    }

    /** 500 ERROR_INTERNO (000 §5): sin trazas ni mensajes internos; el detalle queda en el log con el correlationId. */
    private static ProblemDetail interno() {
        return Problemas.de("ERROR_INTERNO", Problemas.titulo("ERROR_INTERNO"), "Ocurrió un error inesperado");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException e, HttpHeaders h, HttpStatusCode s, WebRequest r) {
        var errores = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new Problemas.ErrorDeCampo(f.getField(), f.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest().body(Problemas.validacion(errores));
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException e, HttpHeaders h, HttpStatusCode s, WebRequest r) {
        var errores = e.getParameterValidationResults().stream()
                .flatMap(v -> v.getResolvableErrors().stream()
                        .map(err -> new Problemas.ErrorDeCampo(
                                v.getMethodParameter().getParameterName(), err.getDefaultMessage())))
                .toList();
        return ResponseEntity.badRequest().body(Problemas.validacion(errores));
    }

    /**
     * Cualquier otro error del framework (parámetro con otro tipo, parámetro o encabezado faltante, JSON ilegible, método
     * no permitido) con su código y un detalle en español; nunca el mensaje en inglés de Spring.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception e, @Nullable Object cuerpo, HttpHeaders h, HttpStatusCode s, WebRequest r) {
        if (s.is5xxServerError() && !(e instanceof AsyncRequestTimeoutException)) {
            LOG.error("Error del framework", e);
            return ResponseEntity.status(500).headers(h).body(interno());
        }
        if (e instanceof HttpMessageNotReadableException && LimiteCuerpoFiltro.excedido(e)) {
            return ResponseEntity.status(413).headers(h).body(limite.problema());
        }
        String codigo = POR_ESTADO.getOrDefault(s.value(), "CONFLICTO_ESTADO");
        Traduccion t = traducir(e, s);
        ProblemDetail p = Problemas.de(codigo, Problemas.titulo(codigo), t.detalle());
        p.setStatus(s.value());
        if (t.campo() != null && s.value() == 400) {
            p.setProperty("errores", List.of(new Problemas.ErrorDeCampo(t.campo(), t.mensaje())));
        }
        return ResponseEntity.status(s).headers(h).body(p);
    }

    /** Detalle para personas y, si se sabe, el campo, parámetro o encabezado culpable (000 §5). */
    private record Traduccion(
            String detalle,
            @Nullable String campo,
            @Nullable String mensaje) {
        static Traduccion de(String detalle) {
            return new Traduccion(detalle, null, null);
        }

        static Traduccion deCampo(String campo, String mensaje) {
            return new Traduccion(campo + ": " + mensaje, campo, mensaje);
        }
    }

    private static Traduccion traducir(Exception e, HttpStatusCode s) {
        return switch (e) {
            case TypeMismatchException t ->
                Traduccion.deCampo(t.getPropertyName() == null ? "parametro" : t.getPropertyName(), "valor inválido");
            case MissingServletRequestParameterException m ->
                new Traduccion("Falta el parámetro " + m.getParameterName(), m.getParameterName(), "es obligatorio");
            case MissingRequestHeaderException m ->
                new Traduccion("Falta el encabezado " + m.getHeaderName(), m.getHeaderName(), "es obligatorio");
            case HttpMessageNotReadableException n -> {
                String ruta = rutaJson(n);
                yield ruta == null
                        ? Traduccion.de("El cuerpo no es JSON válido o no sigue el contrato")
                        : Traduccion.deCampo(ruta, "valor inválido o de otro tipo");
            }
            case HttpRequestMethodNotSupportedException m ->
                Traduccion.de("El método " + m.getMethod() + " no existe en esta ruta");
            case HttpMediaTypeNotSupportedException _ ->
                Traduccion.de("Content-Type no soportado; usa application/json");
            case HttpMediaTypeNotAcceptableException _ ->
                Traduccion.de("No se puede responder en el formato que pide Accept");
            case NoResourceFoundException _ -> Traduccion.de("No existe la ruta");
            case NoHandlerFoundException _ -> Traduccion.de("No existe la ruta");
            case MaxUploadSizeExceededException _ -> Traduccion.de("El cuerpo pasa el tamaño máximo");
            case AsyncRequestTimeoutException _ ->
                Traduccion.de("La respuesta tardó demasiado; reintenta en unos segundos");
            default ->
                Traduccion.de(
                        switch (s.value()) {
                            case 404 -> "No existe la ruta";
                            case 405 -> "Método no permitido en esta ruta";
                            case 413 -> "El cuerpo pasa el tamaño máximo";
                            default -> "La petición no es válida";
                        });
        };
    }

    /** {@code posicion.lat} o {@code fotos[0]}, según la ruta que Jackson armó al fallar. */
    @Nullable
    private static String rutaJson(Throwable e) {
        for (Throwable c = e; c != null; c = c.getCause()) {
            if (!(c instanceof JacksonException j) || j.getPath().isEmpty()) continue;
            var ruta = new StringBuilder();
            for (var ref : j.getPath()) {
                if (ref.getPropertyName() != null) {
                    if (!ruta.isEmpty()) ruta.append('.');
                    ruta.append(ref.getPropertyName());
                } else if (ref.getIndex() >= 0) {
                    ruta.append('[').append(ref.getIndex()).append(']');
                }
            }
            return ruta.isEmpty() ? null : ruta.toString();
        }
        return null;
    }
}
