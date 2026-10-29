package bo.transporte.viajes;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.json.JsonMapper;

/** Con OIDC_ISSUER: arranca aunque Keycloak no responda (descubierta perezosa) y sin token responde 401 NO_AUTENTICADO. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
	properties = "seguridad.issuer=http://localhost:1/realms/transporte")
@Import(TestcontainersConfiguration.class)
class SeguridadIT {
	@LocalServerPort int puerto;
	@Autowired JsonMapper json;

	@Test
	void sinTokenRespondeNoAutenticado() throws Exception {
		var r = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + "/api/v1/servicios")).build(),
			HttpResponse.BodyHandlers.ofString());
		assertEquals(401, r.statusCode());
		assertEquals("NO_AUTENTICADO", json.readTree(r.body()).get("codigo").asString());
		var salud = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + "/health")).build(),
			HttpResponse.BodyHandlers.ofString());
		assertEquals(200, salud.statusCode());
	}
}
