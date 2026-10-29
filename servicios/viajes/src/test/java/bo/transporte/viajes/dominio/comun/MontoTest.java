package bo.transporte.viajes.dominio.comun;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MontoTest {
	@Test
	void redondeaHalfUpADosDecimales() {
		assertEquals("2800.00", Monto.bob("2800").comoTexto());
		assertEquals("10.01", Monto.bob("10.005").comoTexto());
		assertEquals("18200.00", Monto.bob("650").por(new BigDecimal("28")).comoTexto());
	}

	@Test
	void rechazaNegativosYOtraMoneda() {
		assertEquals("VALIDACION", assertThrows(ErrorDeDominio.class, () -> Monto.bob("-1")).codigo());
		assertThrows(ErrorDeDominio.class, () -> new Monto(BigDecimal.ONE, "USD"));
	}

	@Test
	void uuid7EsVersion7YOrdenaPorFecha() throws InterruptedException {
		var a = Uuid7.nuevo();
		Thread.sleep(2);
		var b = Uuid7.nuevo();
		assertEquals(7, a.version());
		assertEquals(2, a.variant());
		assertEquals(-1, Integer.signum(a.toString().compareTo(b.toString())));
	}
}
