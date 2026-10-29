package bo.transporte.viajes;

import bo.transporte.viajes.adaptadores.temporal.ActividadesSaga;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ConfirmarReservaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.LiberarCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.LiberarReservaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.Monto;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.RegistrarDecisionCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ReservarUnidadEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ReservarUnidadResultado;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoResultado;
import bo.transporte.viajes.adaptadores.temporal.ConversorTemporal;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.testing.TestEnvironmentOptions;
import io.temporal.testing.TestWorkflowEnvironment;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Temporal en memoria para las pruebas de la API. El worker real de Viajes (TrabajadorViajes) corre contra este
 * servidor; las colas finanzas y flota las atienden dobles que responden el ejemplo del contrato y anotan cada llamada.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TemporalDePrueba {
    public static final UUID RUTA_AULA = UUID.fromString("01933a00-0000-7000-8000-000000000004");

    /** Finanzas por defecto: Aula, 28 t de granos, 2.800,00 BOB, reservado. */
    public static class FinanzasFalsa implements ActividadesSaga.Finanzas {
        public final List<String> llamadas;
        public volatile Runnable alLiberar = () -> {};
        public volatile Function<ValidarYReservarCreditoEntrada, ValidarYReservarCreditoResultado> respuesta =
                FinanzasFalsa::reservado;

        public FinanzasFalsa() {
            this(new CopyOnWriteArrayList<>());
        }

        /** {@code llamadas} compartida con las otras colas para verificar el orden de las compensaciones. */
        public FinanzasFalsa(List<String> llamadas) {
            this.llamadas = llamadas;
        }

        public static ValidarYReservarCreditoResultado reservado(ValidarYReservarCreditoEntrada e) {
            return new ValidarYReservarCreditoResultado(
                    "RESERVADO",
                    UUID.nameUUIDFromBytes(e.servicioId().toString().getBytes()),
                    RUTA_AULA,
                    "GRANOS",
                    new BigDecimal("28"),
                    LocalDate.of(2026, 11, 3),
                    new Monto("2800.00", "BOB"),
                    null);
        }

        @Override
        public ValidarYReservarCreditoResultado validarYReservarCredito(ValidarYReservarCreditoEntrada e) {
            llamadas.add("Finanzas.validarYReservarCredito");
            return respuesta.apply(e);
        }

        @Override
        public void registrarDecisionCredito(RegistrarDecisionCreditoEntrada e) {
            llamadas.add("Finanzas.registrarDecisionCredito:" + e.decision());
        }

        @Override
        public void liberarCredito(LiberarCreditoEntrada e) {
            alLiberar.run();
            llamadas.add("Finanzas.liberarCredito:" + e.motivo());
        }
    }

    /** Flota por defecto: el furgón 4521KTR con chofer1. */
    public static class FlotaFalsa implements ActividadesSaga.Flota {
        public final List<String> llamadas;
        public volatile Function<ReservarUnidadEntrada, ReservarUnidadResultado> respuesta = FlotaFalsa::reservada;

        public FlotaFalsa() {
            this(new CopyOnWriteArrayList<>());
        }

        public FlotaFalsa(List<String> llamadas) {
            this.llamadas = llamadas;
        }

        public static ReservarUnidadResultado reservada(ReservarUnidadEntrada e) {
            return new ReservarUnidadResultado(
                    UUID.nameUUIDFromBytes(("reserva" + e.servicioId()).getBytes()),
                    UUID.fromString("01933c00-0000-7000-8000-000000000001"),
                    UUID.fromString("01933c00-0000-7000-8000-000000000011"),
                    "4521KTR",
                    UUID.fromString("01933c00-0000-7000-8000-000000000021"),
                    "Juan Mamani",
                    "0193a000-0000-7000-8000-000000000005");
        }

        @Override
        public ReservarUnidadResultado reservarUnidad(ReservarUnidadEntrada e) {
            llamadas.add("Flota.reservarUnidad");
            return respuesta.apply(e);
        }

        @Override
        public void confirmarReserva(ConfirmarReservaEntrada e) {
            llamadas.add("Flota.confirmarReserva");
        }

        @Override
        public void liberarReserva(LiberarReservaEntrada e) {
            llamadas.add("Flota.liberarReserva");
        }
    }

    @Bean
    FinanzasFalsa finanzasFalsa() {
        return new FinanzasFalsa();
    }

    @Bean
    FlotaFalsa flotaFalsa() {
        return new FlotaFalsa();
    }

    @Bean(destroyMethod = "close")
    TestWorkflowEnvironment entornoTemporal(FinanzasFalsa finanzas, FlotaFalsa flota) {
        var env = TestWorkflowEnvironment.newInstance(TestEnvironmentOptions.newBuilder()
                .setWorkflowClientOptions(WorkflowClientOptions.newBuilder()
                        .setNamespace("transporte")
                        .setDataConverter(ConversorTemporal.dataConverter())
                        .build())
                .build());
        env.newWorker("finanzas").registerActivitiesImplementations(finanzas);
        env.newWorker("flota").registerActivitiesImplementations(flota);
        env.start();
        return env;
    }

    @Bean
    @Primary
    WorkflowClient clienteTemporalDePrueba(TestWorkflowEnvironment env) {
        return env.getWorkflowClient();
    }
}
