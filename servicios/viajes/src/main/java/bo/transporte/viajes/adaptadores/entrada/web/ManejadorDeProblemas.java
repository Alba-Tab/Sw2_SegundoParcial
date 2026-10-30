package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import software.amazon.awssdk.core.exception.SdkException;

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

    @ExceptionHandler(Exception.class)
    ProblemDetail inesperado(Exception e) {
        LOG.error("Error no controlado", e);
        ProblemDetail p = Problemas.de("DEPENDENCIA_NO_DISPONIBLE", "Error interno", "Ocurrió un error inesperado");
        p.setStatus(500);
        return p;
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

    /** Cualquier otro error del framework (encabezado faltante, JSON ilegible, método no permitido) con su código. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception e, @Nullable Object cuerpo, HttpHeaders h, HttpStatusCode s, WebRequest r) {
        String codigo = POR_ESTADO.getOrDefault(s.value(), "CONFLICTO_ESTADO");
        String detalle = cuerpo instanceof ProblemDetail pd && pd.getDetail() != null ? pd.getDetail() : e.getMessage();
        ProblemDetail p = Problemas.de(codigo, Problemas.titulo(codigo), detalle);
        p.setStatus(s.value());
        return ResponseEntity.status(s).headers(h).body(p);
    }
}
