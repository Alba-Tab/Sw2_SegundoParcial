package bo.transporte.viajes.aplicacion.dispositivo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.NotificadorPush;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** D45: qué eventos avisan al chofer, una sola vez, y qué pasa con un token que FCM ya no reconoce. */
class AvisosPushTest {
    static class Dispositivos implements DispositivoRepositorio {
        final Map<UUID, String> avisos = new HashMap<>();
        final List<String> tokens = new ArrayList<>(List.of("token-viejo", "token-nuevo"));

        public void guardar(Dispositivo d) {}

        public Optional<Dispositivo> porId(UUID id) {
            return Optional.empty();
        }

        public List<String> tokensPush(String sub) {
            return "chofer1".equals(sub) ? List.copyOf(tokens) : List.of();
        }

        public void olvidarToken(String token) {
            tokens.remove(token);
        }

        public boolean registrarAviso(UUID id, String tipo, String resultado) {
            return avisos.putIfAbsent(id, resultado) == null;
        }

        public void actualizarAviso(UUID id, String resultado) {
            avisos.put(id, resultado);
        }
    }

    final Dispositivos dispositivos = new Dispositivos();
    final List<String> enviados = new ArrayList<>();
    final NotificadorPush fcm = (token, m) -> {
        enviados.add(token + ":" + m.titulo() + ":" + m.agrupar());
        return token.equals("token-viejo")
                ? NotificadorPush.Resultado.TOKEN_INVALIDO
                : NotificadorPush.Resultado.ENVIADO;
    };
    final AvisosPush avisos = new AvisosPush(null, dispositivos, fcm);

    @Test
    void soloAvisaLoQueLeImportaAlChofer() {
        assertTrue(AvisosPush.avisoDe("ViajeConfirmado", Map.of("placa", "4521KTR"))
                .isPresent());
        assertTrue(AvisosPush.avisoDe("ViajeCancelado", Map.of("origen", "USUARIO"))
                .isPresent());
        assertTrue(
                AvisosPush.avisoDe("ViajeCancelado", Map.of("origen", "SAGA")).isEmpty());
        assertTrue(AvisosPush.avisoDe("EntregaConfirmada", Map.of()).isEmpty());
        assertTrue(AvisosPush.avisoDe("EntregaConfirmada", Map.of("aprobadaPor", "d"))
                .isPresent());
        assertTrue(AvisosPush.avisoDe("EntregaRechazada", Map.of("origenRechazo", "RECEPTOR"))
                .isEmpty());
        assertTrue(AvisosPush.avisoDe("EntregaRechazada", Map.of("origenRechazo", "DESPACHADOR", "motivo", "x"))
                .isPresent());
    }

    @Test
    void avisaUnaSolaVezAgrupadoPorViajeYOlvidaElTokenInvalido() {
        UUID evento = UUID.randomUUID();
        var datos = Map.<String, Object>of("viajeId", "v1", "placa", "4521KTR", "choferUsuarioSub", "chofer1");
        assertEquals("ENVIADO", avisos.procesar(evento, "ViajeConfirmado", datos));
        assertEquals(List.of("token-viejo:Viaje asignado:v1", "token-nuevo:Viaje asignado:v1"), enviados);
        assertEquals(List.of("token-nuevo"), dispositivos.tokens);
        assertNull(avisos.procesar(evento, "ViajeConfirmado", datos));
        assertEquals(2, enviados.size());
    }

    @Test
    void sinCelularOEventoQueNoAvisaQuedaRegistrado() {
        var otro = Map.<String, Object>of("viajeId", "v2", "placa", "1", "choferUsuarioSub", "chofer9");
        assertEquals("SIN_DISPOSITIVO", avisos.procesar(UUID.randomUUID(), "ViajeConfirmado", otro));
        var saga = Map.<String, Object>of("viajeId", "v2", "origen", "SAGA");
        assertEquals("NO_APLICA", avisos.procesar(UUID.randomUUID(), "ViajeCancelado", saga));
        assertTrue(enviados.isEmpty());
    }
}
