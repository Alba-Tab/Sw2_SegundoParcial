package bo.transporte.viajes.adaptadores.entrada.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Tope de los cuerpos JSON (256 KB por defecto, {@code servidor.cuerpo-maximo}): lo más grande es un lote de 100
 * puntos GPS, y las fotos van directo a S3 con URL firmada. Con {@code Content-Length} mayor responde 413 sin leer el
 * cuerpo; sin largo (chunked) corta la lectura al pasar el tope y {@link ManejadorDeProblemas} responde 413.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class LimiteCuerpoFiltro extends OncePerRequestFilter {
    private final long maximo;
    private final JsonMapper json;

    LimiteCuerpoFiltro(@Value("${servidor.cuerpo-maximo:256KB}") DataSize maximo, JsonMapper json) {
        this.maximo = maximo.toBytes();
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain cadena)
            throws ServletException, IOException {
        long largo = req.getContentLengthLong();
        if (largo > maximo) {
            res.setStatus(413);
            res.setContentType("application/problem+json");
            // El cuerpo no llega a la aplicación: Tomcat descarta lo que quede y cierra la conexión.
            res.setHeader("Connection", "close");
            json.writeValue(res.getOutputStream(), problema());
            return;
        }
        cadena.doFilter(largo >= 0 ? req : new Acotada(req, maximo), res);
    }

    ProblemDetail problema() {
        ProblemDetail p = Problemas.de(
                "VALIDACION", "Cuerpo demasiado grande", "El cuerpo pasa el máximo de " + maximo / 1024 + " KB");
        p.setStatus(413);
        return p;
    }

    /** El cuerpo sin largo pasó el tope mientras Jackson lo leía. */
    static boolean excedido(Throwable e) {
        for (Throwable c = e; c != null; c = c.getCause()) {
            if (c instanceof CuerpoExcedido) return true;
        }
        return false;
    }

    static final class CuerpoExcedido extends IOException {
        CuerpoExcedido() {
            super("cuerpo mayor que el máximo");
        }
    }

    /** Cuenta los bytes leídos y corta al pasar el tope; el flujo se pide recién cuando alguien lee el cuerpo. */
    private static final class Acotada extends HttpServletRequestWrapper {
        private final long maximo;
        private ServletInputStream entrada;

        Acotada(HttpServletRequest req, long maximo) {
            super(req);
            this.maximo = maximo;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (entrada == null) entrada = new Contador(super.getInputStream(), maximo);
            return entrada;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String cs = getCharacterEncoding();
            return new BufferedReader(
                    new InputStreamReader(getInputStream(), cs == null ? StandardCharsets.UTF_8 : Charset.forName(cs)));
        }
    }

    private static final class Contador extends ServletInputStream {
        private final ServletInputStream original;
        private final long maximo;
        private long leidos;

        Contador(ServletInputStream original, long maximo) {
            this.original = original;
            this.maximo = maximo;
        }

        @Override
        public int read() throws IOException {
            int b = original.read();
            if (b >= 0) contar(1);
            return b;
        }

        @Override
        public int read(byte[] destino, int desde, int cuantos) throws IOException {
            int n = original.read(destino, desde, cuantos);
            if (n > 0) contar(n);
            return n;
        }

        private void contar(int n) throws CuerpoExcedido {
            leidos += n;
            if (leidos > maximo) throw new CuerpoExcedido();
        }

        @Override
        public boolean isFinished() {
            return original.isFinished();
        }

        @Override
        public boolean isReady() {
            return original.isReady();
        }

        @Override
        public void setReadListener(ReadListener oyente) {
            original.setReadListener(oyente);
        }
    }
}
