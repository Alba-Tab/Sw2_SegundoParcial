package bo.transporte.viajes.dominio.comun;

import java.util.Map;

/**
 * Regla de negocio violada. {@code codigo} es el de specs/000-convenciones.md §5 y decide el estado HTTP; {@code datos}
 * va como campos extra del Problem Details (por ejemplo el {@code clienteId} existente en un 409).
 */
public class ErrorDeDominio extends RuntimeException {
    private final String codigo;
    private final Map<String, Object> datos;

    public ErrorDeDominio(String codigo, String mensaje) {
        this(codigo, mensaje, Map.of());
    }

    public ErrorDeDominio(String codigo, String mensaje, Map<String, Object> datos) {
        super(mensaje);
        this.codigo = codigo;
        this.datos = Map.copyOf(datos);
    }

    public String codigo() {
        return codigo;
    }

    public Map<String, Object> datos() {
        return datos;
    }
}
