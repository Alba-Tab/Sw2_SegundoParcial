package bo.transporte.viajes.aplicacion.servicio;

import java.time.Duration;

/**
 * Lo configurable de la saga (spec 003): llega en la entrada del workflow porque el workflow no lee el entorno.
 * Normal: PT24H, PT10M, 8. Demo: PT3M, PT2M, 4.
 */
public record ParametrosSaga(
        Duration esperaAprobacion, Duration compensacionScheduleToClose, int compensacionMaximoIntentos) {}
