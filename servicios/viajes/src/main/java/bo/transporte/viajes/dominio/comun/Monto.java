package bo.transporte.viajes.dominio.comun;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** Dinero (000 §3): BigDecimal con 2 decimales HALF_UP, moneda BOB y nunca negativo. */
public record Monto(BigDecimal monto, String moneda) {
	public static final String BOB = "BOB";

	public Monto {
		Objects.requireNonNull(monto, "monto");
		if (!BOB.equals(moneda)) throw new ErrorDeDominio("VALIDACION", "Moneda no soportada: " + moneda);
		if (monto.signum() < 0) throw new ErrorDeDominio("VALIDACION", "El monto no puede ser negativo");
		monto = monto.setScale(2, RoundingMode.HALF_UP);
	}

	public static Monto bob(String monto) {
		return new Monto(new BigDecimal(monto), BOB);
	}

	public Monto mas(Monto otro) {
		return new Monto(monto.add(otro.monto), moneda);
	}

	public Monto por(BigDecimal factor) {
		return new Monto(monto.multiply(factor), moneda);
	}

	/** Texto decimal del contrato: "2800.00". */
	public String comoTexto() {
		return monto.toPlainString();
	}
}
