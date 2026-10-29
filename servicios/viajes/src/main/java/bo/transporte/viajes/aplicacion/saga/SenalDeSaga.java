package bo.transporte.viajes.aplicacion.saga;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.Map;
import java.util.UUID;

/**
 * Lo común de las dos decisiones humanas de la saga (specs 011 y 012): la clave se registra COMPLETADA solo después de
 * que Temporal recibió la señal. Un reenvío con la misma clave devuelve 202 sin volver a enviarla; si Temporal no
 * respondió, no queda nada guardado y el reenvío vuelve a intentar.
 */
abstract class SenalDeSaga {
    private final RegistroIdempotente idempotencia;
    private final Auditoria auditoria;
    private final Transacciones tx;
    protected final Orquestador orquestador;

    SenalDeSaga(RegistroIdempotente idempotencia, Auditoria auditoria, Transacciones tx, Orquestador orquestador) {
        this.idempotencia = idempotencia;
        this.auditoria = auditoria;
        this.tx = tx;
        this.orquestador = orquestador;
    }

    /** @return true si la señal se envió ahora; false si la clave ya estaba completada (reenvío) */
    protected boolean enviarUnaVez(
            UUID clave,
            String operacion,
            String hashCuerpo,
            Runnable validarYEnviar,
            Solicitante quien,
            String entidad,
            UUID entidadId,
            Map<String, Object> datos) {
        var previa = tx.enTransaccion(() -> idempotencia.buscar(clave));
        if (previa.isPresent()) {
            if (!previa.get().hashCuerpo().equals(hashCuerpo)
                    || !operacion.equals(previa.get().tipo())) {
                throw new ErrorDeDominio("IDEMPOTENCIA_CUERPO_DISTINTO", "La clave ya se usó con otro cuerpo");
            }
            return false;
        }
        try {
            validarYEnviar.run();
        } catch (Orquestador.NoDisponible e) {
            throw new ErrorDeDominio(
                    "DEPENDENCIA_NO_DISPONIBLE", "Temporal no recibió la decisión; reenvíe con la misma clave");
        }
        tx.enTransaccion(() -> {
            try {
                idempotencia.guardarCompletada(clave, operacion, hashCuerpo, 202, null);
            } catch (RegistroIdempotente.ClaveRepetida carrera) {
                return null; // otra petición con la misma clave ya la registró
            }
            auditoria.registrar(quien, "CENTRO_CONTROL", operacion, entidad, entidadId, datos);
            return null;
        });
        return true;
    }

    /** La etapa actual del workflow debe ser la que espera la señal; si Temporal no responde, 503. */
    protected void exigirEtapa(String workflowId, String esperada, String mensaje) {
        String etapa = orquestador
                .etapa(workflowId)
                .orElseThrow(() -> new ErrorDeDominio("DEPENDENCIA_NO_DISPONIBLE", "Temporal no responde"));
        if (!esperada.equals(etapa)) throw new ErrorDeDominio("CONFLICTO_ESTADO", mensaje);
    }
}
