package bo.transporte.viajes.adaptadores.entrada.consola;

import bo.transporte.viajes.adaptadores.salida.persistencia.SemillaJdbc;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

/**
 * Comando de consola (D102), nunca un endpoint: con {@code --semilla.cargar=true} carga la semilla y termina; con
 * {@code --semilla.cargar=reiniciar} ({@code demo:reiniciar}, T8.8) antes vacía la base. En el compose:
 * {@code docker compose run --rm viajes --semilla.cargar=true}.
 */
@Component
@ConditionalOnExpression("'${semilla.cargar:false}' == 'true' or '${semilla.cargar:false}' == 'reiniciar'")
class ComandoSemilla implements ApplicationRunner {
    private static final Logger LOG = LoggerFactory.getLogger(ComandoSemilla.class);
    private final SemillaJdbc semilla;
    private final ConfigurableApplicationContext contexto;
    private final Path dir;

    private final boolean reiniciar;

    ComandoSemilla(
            SemillaJdbc semilla,
            ConfigurableApplicationContext contexto,
            @Value("${semilla.dir}") String dir,
            @Value("${semilla.cargar}") String modo) {
        this.semilla = semilla;
        this.contexto = contexto;
        this.dir = Path.of(dir);
        this.reiniciar = "reiniciar".equals(modo);
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        int[] n = reiniciar ? semilla.reiniciar(dir) : semilla.cargar(dir);
        LOG.info("Semilla de Viajes{}: {} clientes y {} rutas", reiniciar ? " (base vaciada)" : "", n[0], n[1]);
        System.exit(SpringApplication.exit(contexto, () -> 0));
    }
}
