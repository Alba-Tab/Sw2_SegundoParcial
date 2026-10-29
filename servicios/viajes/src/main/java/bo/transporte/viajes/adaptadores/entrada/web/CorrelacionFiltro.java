package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.dominio.comun.Uuid7;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** X-Correlation-Id (000 §4): lo genera si no viene, lo deja en el MDC (logs y Outbox) y lo devuelve. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelacionFiltro extends OncePerRequestFilter {
	public static final String ENCABEZADO = "X-Correlation-Id";
	public static final String MDC_CLAVE = "correlationId";

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain cadena)
			throws ServletException, IOException {
		String id = valido(req.getHeader(ENCABEZADO));
		MDC.put(MDC_CLAVE, id);
		res.setHeader(ENCABEZADO, id);
		try {
			cadena.doFilter(req, res);
		} finally {
			MDC.remove(MDC_CLAVE);
		}
	}

	private static String valido(String recibido) {
		try {
			if (recibido != null) return UUID.fromString(recibido).toString();
		} catch (IllegalArgumentException e) {
			// Un valor que no es UUID se reemplaza: va a los logs y no se confía en él.
		}
		return Uuid7.nuevo().toString();
	}
}
