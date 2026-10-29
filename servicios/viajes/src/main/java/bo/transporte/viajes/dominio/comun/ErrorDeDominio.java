package bo.transporte.viajes.dominio.comun;

/** Regla de negocio violada. {@code codigo} es el de specs/000-convenciones.md §5 y decide el estado HTTP. */
public class ErrorDeDominio extends RuntimeException {
	private final String codigo;

	public ErrorDeDominio(String codigo, String mensaje) {
		super(mensaje);
		this.codigo = codigo;
	}

	public String codigo() {
		return codigo;
	}
}
