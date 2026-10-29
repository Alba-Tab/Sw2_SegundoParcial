package bo.transporte.viajes.configuracion;

import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** 000 §10 y D23: se exportan trazas solo si OTEL_EXPORTER_OTLP_ENDPOINT está definido (perfil trazas o la nube). */
public class TrazasSiHayEndpoint implements EnvironmentPostProcessor {
	@Override
	public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
		String endpoint = env.getProperty("OTEL_EXPORTER_OTLP_ENDPOINT", "");
		env.getPropertySources().addLast(new MapPropertySource("trazas", Map.of(
			"management.tracing.export.enabled", !endpoint.isBlank(),
			"management.opentelemetry.tracing.export.otlp.endpoint", endpoint.isBlank() ? "" : endpoint.replaceAll("/$", "") + "/v1/traces")));
	}
}
