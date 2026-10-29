package bo.transporte.viajes.adaptadores.temporal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import bo.transporte.viajes.TemporalDePrueba.FinanzasFalsa;
import bo.transporte.viajes.TemporalDePrueba.FlotaFalsa;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.*;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.common.WorkflowExecutionHistory;
import io.temporal.failure.ApplicationFailure;
import io.temporal.testing.TestEnvironmentOptions;
import io.temporal.testing.TestWorkflowEnvironment;
import io.temporal.testing.WorkflowReplayer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * La saga con Temporal en memoria y dobles de las tres colas (spec 003, 011 y 012). Una sola lista de llamadas para las
 * tres colas permite verificar el orden inverso de las compensaciones (FS4).
 */
class ProgramarViajeTest {
    static final Path HISTORIAL = Path.of("src/test/resources/historiales/camino-feliz.json");

    TestWorkflowEnvironment env;
    final List<String> llamadas = new CopyOnWriteArrayList<>();
    FinanzasFalsa finanzas;
    FlotaFalsa flota;
    volatile Runnable alCancelar = () -> {};

    static TestWorkflowEnvironment entorno() {
        return TestWorkflowEnvironment.newInstance(TestEnvironmentOptions.newBuilder()
                .setWorkflowClientOptions(WorkflowClientOptions.newBuilder()
                        .setNamespace("transporte")
                        .setDataConverter(ConversorTemporal.dataConverter())
                        .build())
                .build());
    }

    @BeforeEach
    void preparar() {
        env = entorno();
        finanzas = new FinanzasFalsa(llamadas);
        flota = new FlotaFalsa(llamadas);
        env.newWorker("viajes").registerWorkflowImplementationTypes(ProgramarViajeImpl.class);
        env.newWorker("viajes").registerActivitiesImplementations(new ActividadesSaga.Viajes() {
            public void crearViaje(CrearViajeEntrada e) {
                llamadas.add("Viajes.crearViaje");
            }

            public void confirmarViaje(ConfirmarViajeEntrada e) {
                llamadas.add(
                        "Viajes.confirmarViaje:" + e.placa() + ":" + e.monto().monto());
            }

            public void marcarConfirmacionCompleta(MarcarConfirmacionCompletaEntrada e) {
                llamadas.add("Viajes.marcarConfirmacionCompleta");
            }

            public void cancelarViaje(CancelarViajeEntrada e) {
                alCancelar.run();
                llamadas.add("Viajes.cancelarViaje:" + e.motivo());
            }

            public void marcarRequiereIntervencion(MarcarRequiereIntervencionEntrada e) {
                llamadas.add("Viajes.marcarRequiereIntervencion:" + e.compensacionFallida());
            }
        });
        env.newWorker("finanzas").registerActivitiesImplementations(finanzas);
        env.newWorker("flota").registerActivitiesImplementations(flota);
        env.start();
    }

    @AfterEach
    void cerrar() {
        env.close();
    }

    static EntradaProgramarViaje entrada(UUID servicioId) {
        return new EntradaProgramarViaje(
                servicioId,
                UUID.fromString("01933b6e-4c2a-7d10-9a3e-5f1c2b7a8d02"),
                UUID.fromString("01933b5a-1f00-7a20-8b11-0c2d3e4f5a01"),
                UUID.fromString("01933b6e-4c2a-7d10-9a3e-5f1c2b7a8d03"),
                "PORTAL",
                "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
                new ParametrosSaga(Duration.ofMinutes(3), new Compensacion(Duration.ofMinutes(2), 2)));
    }

    ProgramarViaje iniciar(UUID servicioId) {
        var stub = env.getWorkflowClient()
                .newWorkflowStub(
                        ProgramarViaje.class,
                        WorkflowOptions.newBuilder()
                                .setTaskQueue("viajes")
                                .setWorkflowId(ProgramarViaje.workflowId(servicioId))
                                .build());
        WorkflowClient.start(stub::ejecutar, entrada(servicioId));
        return stub;
    }

    static ResultadoProgramarViaje resultado(ProgramarViaje stub) {
        return WorkflowStub.fromTyped(stub).getResult(ResultadoProgramarViaje.class);
    }

    static EstadoProgramarViaje esperar(ProgramarViaje stub, Predicate<EstadoProgramarViaje> condicion)
            throws InterruptedException {
        for (int i = 0; i < 200; i++) {
            var e = stub.estado();
            if (condicion.test(e)) return e;
            Thread.sleep(25);
        }
        throw new AssertionError("El workflow no llegó al estado esperado: " + stub.estado());
    }

    static ApplicationFailure negocio(String codigo) {
        return ApplicationFailure.newNonRetryableFailure(
                "falla " + codigo, codigo, new DetalleFallo(codigo, "Mensaje de " + codigo, null));
    }

    @Test
    void caminoFelizConfirmaYGuardaElHistorialParaElReplay() throws Exception {
        UUID servicioId = UUID.fromString("01933b6e-4c2a-7d10-9a3e-5f1c2b7a8d01");
        var stub = iniciar(servicioId);
        var r = resultado(stub);
        assertEquals("CONFIRMADO", r.resultado());
        assertEquals(
                List.of(
                        "Viajes.crearViaje",
                        "Finanzas.validarYReservarCredito",
                        "Flota.reservarUnidad",
                        "Viajes.confirmarViaje:4521KTR:2800.00",
                        "Flota.confirmarReserva",
                        "Viajes.marcarConfirmacionCompleta"),
                llamadas);
        var estado = stub.estado();
        assertEquals("TERMINADO", estado.etapa());
        assertEquals(
                List.of(
                        "CREAR_VIAJE",
                        "RESERVAR_CREDITO",
                        "RESERVAR_UNIDAD",
                        "CONFIRMAR_VIAJE",
                        "CONFIRMAR_RESERVA",
                        "CONFIRMACION_COMPLETA"),
                estado.pasosCompletados());
        // S16: -DgrabarHistorial=true vuelve a grabar el historial que usa la prueba de replay.
        if (Boolean.getBoolean("grabarHistorial")) {
            WorkflowExecutionHistory h = env.getWorkflowClient().fetchHistory(ProgramarViaje.workflowId(servicioId));
            Files.writeString(HISTORIAL, h.toJson(true));
        }
    }

    @Test
    void replayDelHistorialGuardadoSinNoDeterminismo() throws Exception {
        var historial = WorkflowExecutionHistory.fromJson(Files.readString(HISTORIAL));
        try (var otro = entorno()) {
            WorkflowReplayer.replayWorkflowExecution(historial, otro, ProgramarViajeImpl.class);
        }
    }

    @Test
    void creditoInsuficienteSoloCancelaElViajeYNoReintenta() {
        finanzas.respuesta = e -> {
            throw negocio("CREDITO_INSUFICIENTE");
        };
        var r = resultado(iniciar(UUID.randomUUID()));
        assertEquals("CANCELADO", r.resultado());
        assertEquals("CREDITO_INSUFICIENTE", r.motivo());
        assertEquals(
                List.of(
                        "Viajes.crearViaje",
                        "Finanzas.validarYReservarCredito",
                        "Viajes.cancelarViaje:CREDITO_INSUFICIENTE"),
                llamadas);
    }

    @Test
    void sinUnidadCompatibleLiberaElCreditoAntesDeCancelarElViaje() {
        flota.respuesta = e -> {
            throw negocio("SIN_UNIDAD_COMPATIBLE");
        };
        var r = resultado(iniciar(UUID.randomUUID()));
        assertEquals("SIN_UNIDAD_COMPATIBLE", r.motivo());
        assertEquals(
                List.of(
                        "Viajes.crearViaje",
                        "Finanzas.validarYReservarCredito",
                        "Flota.reservarUnidad",
                        "Finanzas.liberarCredito:SIN_UNIDAD_COMPATIBLE",
                        "Viajes.cancelarViaje:SIN_UNIDAD_COMPATIBLE"),
                llamadas);
    }

    @Test
    void unaFallaTecnicaAgotadaTambienLiberaLaReservaQuePudoQuedar() {
        flota.respuesta = e -> {
            throw new IllegalStateException("Mongo no responde");
        };
        var r = resultado(iniciar(UUID.randomUUID()));
        assertEquals("DEPENDENCIA_NO_DISPONIBLE", r.motivo());
        var compensaciones =
                llamadas.stream().filter(l -> !l.equals("Flota.reservarUnidad")).toList();
        assertEquals(
                List.of(
                        "Viajes.crearViaje",
                        "Finanzas.validarYReservarCredito",
                        "Flota.liberarReserva",
                        "Finanzas.liberarCredito:DEPENDENCIA_NO_DISPONIBLE",
                        "Viajes.cancelarViaje:DEPENDENCIA_NO_DISPONIBLE"),
                compensaciones);
    }

    private void requiereAprobacion() {
        finanzas.respuesta = e -> {
            var r = FinanzasFalsa.reservado(e);
            return new ValidarYReservarCreditoResultado(
                    "REQUIERE_APROBACION",
                    r.reservaCreditoId(),
                    r.rutaId(),
                    r.tipoCarga(),
                    r.toneladas(),
                    r.fechaViaje(),
                    r.monto(),
                    List.of("MORA"));
        };
    }

    @Test
    void conMoraEsperaLaAprobacionYSigueHastaConfirmar() throws Exception {
        requiereAprobacion();
        var stub = iniciar(UUID.randomUUID());
        var estado = esperar(stub, e -> "ESPERANDO_APROBACION".equals(e.etapa()));
        assertNotNull(estado.esperaAprobacionVenceEn());
        stub.aprobacionCredito(new SenalAprobacionCredito(true, "sub-administracion", null));
        assertEquals("CONFIRMADO", resultado(stub).resultado());
        assertTrue(llamadas.contains("Finanzas.registrarDecisionCredito:APROBADA"));
        assertTrue(stub.estado().pasosCompletados().contains("APROBACION_CREDITO"));
    }

    @Test
    void rechazoDelCreditoCompensa() throws Exception {
        requiereAprobacion();
        var stub = iniciar(UUID.randomUUID());
        esperar(stub, e -> "ESPERANDO_APROBACION".equals(e.etapa()));
        stub.aprobacionCredito(new SenalAprobacionCredito(false, "sub-administracion", "Mora de 20 días"));
        var r = resultado(stub);
        assertEquals("CREDITO_RECHAZADO", r.motivo());
        assertEquals(
                List.of(
                        "Viajes.crearViaje",
                        "Finanzas.validarYReservarCredito",
                        "Finanzas.registrarDecisionCredito:RECHAZADA",
                        "Finanzas.liberarCredito:CREDITO_RECHAZADO",
                        "Viajes.cancelarViaje:CREDITO_RECHAZADO"),
                llamadas);
    }

    @Test
    void laEsperaVenceSinSenal() throws Exception {
        requiereAprobacion();
        var stub = iniciar(UUID.randomUUID());
        esperar(stub, e -> "ESPERANDO_APROBACION".equals(e.etapa()));
        env.sleep(Duration.ofMinutes(4));
        var r = resultado(stub);
        assertEquals("APROBACION_VENCIDA", r.motivo());
        assertTrue(llamadas.contains("Finanzas.registrarDecisionCredito:VENCIDA"));
    }

    @Test
    void compensacionAgotadaPideIntervencionYSeMarcaResuelta() throws Exception {
        flota.respuesta = e -> {
            throw negocio("SIN_UNIDAD_COMPATIBLE");
        };
        finanzas.alLiberar = () -> {
            throw new IllegalStateException("PostgreSQL de Finanzas caído");
        };
        var stub = iniciar(UUID.randomUUID());
        var estado = esperar(stub, e -> "REQUIERE_INTERVENCION".equals(e.etapa()));
        assertEquals(List.of("Finanzas.liberarCredito", "Viajes.cancelarViaje"), estado.compensacionesPendientes());
        assertTrue(llamadas.contains("Viajes.marcarRequiereIntervencion:Finanzas.liberarCredito"));
        stub.resolverIntervencion(
                new SenalResolverIntervencion("MARCAR_RESUELTO", "sub-despachador", "Liberado a mano"));
        var r = resultado(stub);
        assertEquals("RESUELTO_MANUALMENTE", r.motivo());
        assertEquals("Viajes.cancelarViaje:RESUELTO_MANUALMENTE", llamadas.getLast());
    }

    @Test
    void compensacionAgotadaSeReintentaCuandoVuelveLaDependencia() throws Exception {
        flota.respuesta = e -> {
            throw negocio("SIN_UNIDAD_COMPATIBLE");
        };
        finanzas.alLiberar = () -> {
            throw new IllegalStateException("PostgreSQL de Finanzas caído");
        };
        var stub = iniciar(UUID.randomUUID());
        esperar(stub, e -> "REQUIERE_INTERVENCION".equals(e.etapa()));
        finanzas.alLiberar = () -> {};
        stub.resolverIntervencion(new SenalResolverIntervencion("REINTENTAR_COMPENSACION", "sub-despachador", null));
        var r = resultado(stub);
        assertEquals("SIN_UNIDAD_COMPATIBLE", r.motivo());
        assertEquals(
                List.of("Finanzas.liberarCredito:SIN_UNIDAD_COMPATIBLE", "Viajes.cancelarViaje:SIN_UNIDAD_COMPATIBLE"),
                llamadas.subList(llamadas.size() - 2, llamadas.size()));
    }
}
