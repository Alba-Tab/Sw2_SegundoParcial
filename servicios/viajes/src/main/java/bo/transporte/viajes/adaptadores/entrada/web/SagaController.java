package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.SagaApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.DecisionCreditoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.IntervencionDto;
import bo.transporte.viajes.aplicacion.saga.DecisionDeCredito;
import bo.transporte.viajes.aplicacion.saga.ResolucionDeIntervencion;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** Las decisiones humanas de la saga (specs 011 y 012): responden 202 cuando Temporal recibió la señal. */
@RestController
class SagaController implements SagaApi {
    private final DecisionDeCredito decision;
    private final ResolucionDeIntervencion intervencion;
    private final JsonMapper json;

    SagaController(DecisionDeCredito decision, ResolucionDeIntervencion intervencion, JsonMapper json) {
        this.decision = decision;
        this.intervencion = intervencion;
        this.json = json;
    }

    @Override
    public ResponseEntity<Void> decidirAprobacionCredito(UUID servicioId, UUID clave, DecisionCreditoDto cuerpo) {
        decision.ejecutar(
                SolicitanteActual.obtener(),
                servicioId,
                cuerpo.getAprobado(),
                cuerpo.getMotivo(),
                clave,
                HashCuerpo.de(json, cuerpo));
        return ResponseEntity.accepted().build();
    }

    @Override
    public ResponseEntity<Void> resolverIntervencion(UUID viajeId, UUID clave, IntervencionDto cuerpo) {
        intervencion.ejecutar(
                SolicitanteActual.obtener(),
                viajeId,
                cuerpo.getOpcion().getValue(),
                cuerpo.getNota(),
                clave,
                HashCuerpo.de(json, cuerpo));
        return ResponseEntity.accepted().build();
    }
}
