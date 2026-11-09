package bo.transporte.viajes.adaptadores.entrada.programado;

import bo.transporte.viajes.aplicacion.servicio.ConfirmacionDeServicio;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Cada minuto reanuda las confirmaciones que quedaron en PROGRAMANDO porque Temporal no respondió (D43). */
@Component
class ReanudadorDeConfirmaciones {
    private static final Logger LOG = LoggerFactory.getLogger(ReanudadorDeConfirmaciones.class);

    private final ConfirmacionDeServicio confirmacion;
    private final Duration antiguedad;

    ReanudadorDeConfirmaciones(
            ConfirmacionDeServicio confirmacion, @Value("${saga.reanudar.antiguedad:PT1M}") Duration antiguedad) {
        this.confirmacion = confirmacion;
        this.antiguedad = antiguedad;
    }

    @Scheduled(
            fixedDelayString = "${saga.reanudar.intervalo:PT1M}",
            initialDelayString = "${saga.reanudar.intervalo:PT1M}")
    public void reanudar() {
        try {
            int n = confirmacion.reanudarPendientes(antiguedad);
            if (n > 0) LOG.info("Se reanudaron {} confirmaciones que esperaban a Temporal", n);
        } catch (RuntimeException e) {
            LOG.warn("No se pudieron reanudar las confirmaciones pendientes: {}", e.getMessage());
        }
    }
}
