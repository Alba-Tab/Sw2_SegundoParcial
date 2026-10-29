package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Todo error sale como application/problem+json con su código; nunca trazas de pila ni mensajes de la base. */
@RestControllerAdvice
class ManejadorDeProblemas extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ManejadorDeProblemas.class);

    @ExceptionHandler(ErrorDeDominio.class)
    ProblemDetail dominio(ErrorDeDominio e) {
        return Problemas.de(e.codigo(), e.codigo(), e.getMessage());
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
    protected ResponseEntity<Object> handleNoResourceFoundException(
            NoResourceFoundException e, HttpHeaders h, HttpStatusCode s, WebRequest r) {
        return ResponseEntity.status(404).body(Problemas.de("NO_ENCONTRADO", "No encontrado", "El recurso no existe"));
    }
}
