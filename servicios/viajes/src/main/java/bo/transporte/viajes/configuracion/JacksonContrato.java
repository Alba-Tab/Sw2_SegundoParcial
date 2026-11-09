package bo.transporte.viajes.configuracion;

import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PaginaClientesDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PaginaServiciosDto;
import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * La inclusión por defecto es NON_NULL (000: un campo ausente es opcional), pero en las páginas {@code siguienteCursor}
 * es obligatorio y nullable (000 §4): debe salir como {@code null} en la última página.
 */
@Configuration
class JacksonContrato {

    @Bean
    JsonMapperBuilderCustomizer paginasConCursorNulo() {
        var siempre = JsonInclude.Value.construct(JsonInclude.Include.ALWAYS, JsonInclude.Include.ALWAYS);
        return b -> {
            b.withConfigOverride(PaginaClientesDto.class, o -> o.setInclude(siempre));
            b.withConfigOverride(PaginaServiciosDto.class, o -> o.setInclude(siempre));
        };
    }
}
