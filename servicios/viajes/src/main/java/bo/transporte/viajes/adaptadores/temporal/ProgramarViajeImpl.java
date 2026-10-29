package bo.transporte.viajes.adaptadores.temporal;

import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.CancelarViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ConfirmarReservaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ConfirmarViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.CrearViajeEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.DetalleFallo;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.EntradaProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.EstadoProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.LiberarCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.LiberarReservaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.MarcarConfirmacionCompletaEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.MarcarRequiereIntervencionEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.RegistrarDecisionCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ReservarUnidadEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ReservarUnidadResultado;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ResultadoProgramarViaje;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.SenalAprobacionCredito;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.SenalResolverIntervencion;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoEntrada;
import bo.transporte.viajes.adaptadores.temporal.ContratoSaga.ValidarYReservarCreditoResultado;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.failure.ActivityFailure;
import io.temporal.failure.ApplicationFailure;
import io.temporal.failure.TemporalFailure;
import io.temporal.workflow.Workflow;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;

/**
 * ProgramarViaje (spec 003, 011 y 012). Pasos 1, 2, 2b y 3 son compensables; el paso 4 es el pivote y 5 y 6 se
 * reintentan sin límite. Determinista: no lee el entorno ni el reloj del sistema; todo lo configurable llega en
 * {@code parametrosSaga} y el tiempo sale de {@link Workflow#currentTimeMillis()}. Un cambio de esta lógica con
 * ejecuciones abiertas va con {@code Workflow.getVersion} y la prueba de replay (S16).
 */
public class ProgramarViajeImpl implements ProgramarViaje {
    private static final Logger LOG = Workflow.getLogger(ProgramarViajeImpl.class);
    private static final RetryOptions REINTENTO = RetryOptions.newBuilder()
            .setInitialInterval(Duration.ofSeconds(1))
            .setBackoffCoefficient(2)
            .setMaximumInterval(Duration.ofSeconds(30))
            .build();
    /** contratos/comun/tipos.schema.json#/$defs/MotivoCancelacion: lo que puede terminar en {@code motivo}. */
    private static final Set<String> MOTIVOS = Set.of(
            "COTIZACION_VENCIDA",
            "COTIZACION_AJENA",
            "CREDITO_INSUFICIENTE",
            "CREDITO_RECHAZADO",
            "APROBACION_VENCIDA",
            "SIN_UNIDAD_COMPATIBLE",
            "CLIENTE_NO_REPLICADO",
            "DEPENDENCIA_NO_DISPONIBLE",
            "VALIDACION");

    private static final String LIBERAR_RESERVA = "Flota.liberarReserva";
    private static final String LIBERAR_CREDITO = "Finanzas.liberarCredito";
    private static final String CANCELAR_VIAJE = "Viajes.cancelarViaje";

    private String etapa = "INICIANDO";
    private final List<String> pasos = new ArrayList<>();
    /** Compensaciones pendientes, en el orden en que se corren (inverso a los pasos). */
    private final LinkedList<String> compensaciones = new LinkedList<>();

    private Instant esperaVenceEn;
    private String motivo;
    private SenalAprobacionCredito aprobacion;
    private SenalResolverIntervencion resolucion;

    private EntradaProgramarViaje entrada;
    private ActividadesSaga.Viajes viajes;
    private ActividadesSaga.Viajes viajesSinLimite;
    private ActividadesSaga.Viajes viajesCompensacion;
    private ActividadesSaga.Finanzas finanzas;
    private ActividadesSaga.Finanzas finanzasDecision;
    private ActividadesSaga.Finanzas finanzasCompensacion;
    private ActividadesSaga.Flota flota;
    private ActividadesSaga.Flota flotaSinLimite;
    private ActividadesSaga.Flota flotaCompensacion;
    private UUID reservaUnidadId;

    @Override
    public ResultadoProgramarViaje ejecutar(EntradaProgramarViaje e) {
        this.entrada = e;
        prepararActividades(e);

        ValidarYReservarCreditoResultado credito;
        ReservarUnidadResultado unidad;
        try {
            // Siempre se compensa el paso 1: el servicio no puede quedar en PROGRAMANDO aunque el viaje no se creara.
            compensaciones.addFirst(CANCELAR_VIAJE);
            viajes.crearViaje(new CrearViajeEntrada(e.servicioId(), e.viajeId(), e.clienteId(), e.cotizacionId()));
            pasos.add("CREAR_VIAJE");

            etapa = "VALIDANDO_CREDITO";
            credito = conCompensacion(
                    LIBERAR_CREDITO,
                    () -> finanzas.validarYReservarCredito(new ValidarYReservarCreditoEntrada(
                            e.servicioId(),
                            e.clienteId(),
                            e.cotizacionId(),
                            e.parametrosSaga().esperaAprobacion())));
            pasos.add("RESERVAR_CREDITO");

            if ("REQUIERE_APROBACION".equals(credito.resultado())) {
                esperarAprobacion(e);
                pasos.add("APROBACION_CREDITO");
            }

            etapa = "RESERVANDO_UNIDAD";
            unidad = conCompensacion(
                    LIBERAR_RESERVA,
                    () -> flota.reservarUnidad(new ReservarUnidadEntrada(
                            e.servicioId(),
                            e.viajeId(),
                            credito.tipoCarga(),
                            credito.toneladas(),
                            credito.fechaViaje())));
            reservaUnidadId = unidad.reservaUnidadId();
            pasos.add("RESERVAR_UNIDAD");
        } catch (TemporalFailure f) {
            motivo = motivo(f);
            LOG.info("Saga {} compensa por {}", e.servicioId(), motivo);
            return compensar(mensaje(f));
        }

        // Pivote: desde aquí no hay compensación.
        etapa = "CONFIRMANDO";
        viajesSinLimite.confirmarViaje(new ConfirmarViajeEntrada(
                e.viajeId(),
                credito.rutaId(),
                credito.tipoCarga(),
                credito.toneladas(),
                credito.fechaViaje(),
                credito.monto(),
                unidad.reservaUnidadId(),
                unidad.tractoId(),
                unidad.remolqueId(),
                unidad.placa(),
                unidad.choferId(),
                unidad.choferNombre(),
                unidad.choferUsuarioSub()));
        compensaciones.clear();
        pasos.add("CONFIRMAR_VIAJE");
        flotaSinLimite.confirmarReserva(new ConfirmarReservaEntrada(unidad.reservaUnidadId(), e.servicioId()));
        pasos.add("CONFIRMAR_RESERVA");
        viajesSinLimite.marcarConfirmacionCompleta(new MarcarConfirmacionCompletaEntrada(e.servicioId()));
        pasos.add("CONFIRMACION_COMPLETA");
        etapa = "TERMINADO";
        return new ResultadoProgramarViaje("CONFIRMADO", e.servicioId(), e.viajeId(), null);
    }

    /** Paso 2b (spec 012): espera la señal hasta {@code esperaAprobacion} y registra la decisión en Finanzas. */
    private void esperarAprobacion(EntradaProgramarViaje e) {
        etapa = "ESPERANDO_APROBACION";
        Duration espera = e.parametrosSaga().esperaAprobacion();
        esperaVenceEn = Instant.ofEpochMilli(Workflow.currentTimeMillis()).plus(espera);
        boolean llego = Workflow.await(espera, () -> aprobacion != null);
        esperaVenceEn = null;
        etapa = "VALIDANDO_CREDITO";
        String decision = !llego ? "VENCIDA" : aprobacion.aprobado() ? "APROBADA" : "RECHAZADA";
        finanzasDecision.registrarDecisionCredito(new RegistrarDecisionCreditoEntrada(
                e.servicioId(),
                decision,
                llego ? aprobacion.aprobadoPor() : "sistema",
                llego ? aprobacion.motivo() : null));
        if (!llego) {
            throw ApplicationFailure.newNonRetryableFailure(
                    "Venció la espera de aprobación de crédito", "APROBACION_VENCIDA");
        }
        if (!aprobacion.aprobado()) {
            String nota = aprobacion.motivo() == null ? "" : ": " + aprobacion.motivo();
            throw ApplicationFailure.newNonRetryableFailure("Crédito rechazado" + nota, "CREDITO_RECHAZADO");
        }
    }

    /**
     * Corre el paso y deja su compensación pendiente si terminó bien o si falló por algo técnico (el otro servicio
     * pudo haber reservado antes de que venciera el tiempo). Un error de negocio del propio paso no reservó nada.
     */
    private <T> T conCompensacion(String compensacion, Supplier<T> paso) {
        try {
            T resultado = paso.get();
            compensaciones.addFirst(compensacion);
            return resultado;
        } catch (ActivityFailure f) {
            if (!(f.getCause() instanceof ApplicationFailure af && af.isNonRetryable())) {
                compensaciones.addFirst(compensacion);
            }
            throw f;
        }
    }

    /**
     * Compensa en orden inverso. Si una compensación se agota, el viaje pasa a REQUIERE_INTERVENCION y se espera
     * {@code resolverIntervencion} sin temporizador (spec 011).
     */
    private ResultadoProgramarViaje compensar(String detalle) {
        etapa = "COMPENSANDO";
        while (true) {
            try {
                while (!compensaciones.isEmpty()) {
                    correr(compensaciones.getFirst(), detalle);
                    compensaciones.removeFirst();
                }
                etapa = "TERMINADO";
                return new ResultadoProgramarViaje("CANCELADO", entrada.servicioId(), entrada.viajeId(), motivo);
            } catch (ActivityFailure f) {
                String fallida = compensaciones.getFirst();
                LOG.warn("Saga {}: se agotó {}", entrada.servicioId(), fallida);
                etapa = "REQUIERE_INTERVENCION";
                viajesSinLimite.marcarRequiereIntervencion(new MarcarRequiereIntervencionEntrada(
                        entrada.viajeId(),
                        entrada.servicioId(),
                        fallida,
                        new DetalleFallo(codigoTecnico(f), mensaje(f), null),
                        entrada.parametrosSaga().compensacion().maximoIntentos()));
                Workflow.await(() -> resolucion != null);
                var r = resolucion;
                resolucion = null;
                if ("MARCAR_RESUELTO".equals(r.opcion())) {
                    motivo = "RESUELTO_MANUALMENTE";
                    String nota = r.nota() == null ? "" : r.nota();
                    viajesSinLimite.cancelarViaje(
                            new CancelarViajeEntrada(entrada.viajeId(), motivo, "Resuelto manualmente: " + nota));
                    compensaciones.clear();
                    etapa = "TERMINADO";
                    return new ResultadoProgramarViaje("CANCELADO", entrada.servicioId(), entrada.viajeId(), motivo);
                }
                etapa = "COMPENSANDO";
            }
        }
    }

    private void correr(String compensacion, String detalle) {
        switch (compensacion) {
            case LIBERAR_RESERVA ->
                flotaCompensacion.liberarReserva(new LiberarReservaEntrada(entrada.servicioId(), reservaUnidadId));
            case LIBERAR_CREDITO ->
                finanzasCompensacion.liberarCredito(new LiberarCreditoEntrada(entrada.servicioId(), motivo));
            case CANCELAR_VIAJE ->
                viajesCompensacion.cancelarViaje(new CancelarViajeEntrada(entrada.viajeId(), motivo, detalle));
            default -> throw new IllegalStateException(compensacion);
        }
    }

    /** El código de negocio (ApplicationFailure.type) o DEPENDENCIA_NO_DISPONIBLE si fue técnico. */
    private static String motivo(TemporalFailure f) {
        ApplicationFailure af = aplicacion(f);
        return af != null && MOTIVOS.contains(af.getType()) ? af.getType() : "DEPENDENCIA_NO_DISPONIBLE";
    }

    private static String codigoTecnico(TemporalFailure f) {
        ApplicationFailure af = aplicacion(f);
        return af != null && af.getType() != null && af.getType().matches("^[A-Z][A-Z_]*[A-Z]$")
                ? af.getType()
                : "DEPENDENCIA_NO_DISPONIBLE";
    }

    /** El mensaje del DetalleFallo (venga de PHP, TS o Java) o el del error técnico. */
    private static String mensaje(TemporalFailure f) {
        ApplicationFailure af = aplicacion(f);
        if (af != null) {
            try {
                DetalleFallo d = af.getDetails().get(DetalleFallo.class);
                if (d != null && d.mensaje() != null) return d.mensaje();
            } catch (RuntimeException sinDetalle) {
                // Sin details o con otra forma: se usa el mensaje original.
            }
            return af.getOriginalMessage();
        }
        Throwable raiz = f;
        while (raiz.getCause() != null) raiz = raiz.getCause();
        return raiz.getMessage();
    }

    private static ApplicationFailure aplicacion(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof ApplicationFailure af) return af;
        }
        return null;
    }

    @Override
    public void aprobacionCredito(SenalAprobacionCredito senal) {
        if (aprobacion == null) aprobacion = senal;
    }

    @Override
    public void resolverIntervencion(SenalResolverIntervencion senal) {
        if ("REQUIERE_INTERVENCION".equals(etapa)) resolucion = senal;
    }

    @Override
    public EstadoProgramarViaje estado() {
        boolean compensando = "COMPENSANDO".equals(etapa) || "REQUIERE_INTERVENCION".equals(etapa);
        return new EstadoProgramarViaje(
                etapa, List.copyOf(pasos), esperaVenceEn, motivo, compensando ? List.copyOf(compensaciones) : null);
    }

    /** Timeouts y reintentos de D15 (spec 003). */
    private void prepararActividades(EntradaProgramarViaje e) {
        var c = e.parametrosSaga().compensacion();
        RetryOptions compensacion = RetryOptions.newBuilder(REINTENTO)
                .setMaximumAttempts(c.maximoIntentos())
                .build();
        viajes = Workflow.newActivityStub(
                ActividadesSaga.Viajes.class,
                opciones("viajes", 10, Duration.ofMinutes(5), noReintentar("VALIDACION")));
        viajesSinLimite =
                Workflow.newActivityStub(ActividadesSaga.Viajes.class, opciones("viajes", 10, null, REINTENTO));
        viajesCompensacion = Workflow.newActivityStub(
                ActividadesSaga.Viajes.class, opciones("viajes", 15, c.scheduleToClose(), compensacion));
        finanzas = Workflow.newActivityStub(
                ActividadesSaga.Finanzas.class,
                opciones(
                        "finanzas",
                        15,
                        Duration.ofMinutes(30),
                        noReintentar("COTIZACION_VENCIDA", "COTIZACION_AJENA", "CREDITO_INSUFICIENTE")));
        finanzasDecision = Workflow.newActivityStub(
                ActividadesSaga.Finanzas.class, opciones("finanzas", 15, Duration.ofMinutes(30), REINTENTO));
        finanzasCompensacion = Workflow.newActivityStub(
                ActividadesSaga.Finanzas.class, opciones("finanzas", 15, c.scheduleToClose(), compensacion));
        flota = Workflow.newActivityStub(
                ActividadesSaga.Flota.class,
                opciones("flota", 15, Duration.ofMinutes(30), noReintentar("SIN_UNIDAD_COMPATIBLE")));
        flotaSinLimite = Workflow.newActivityStub(
                ActividadesSaga.Flota.class,
                opciones(
                        "flota",
                        15,
                        null,
                        RetryOptions.newBuilder(REINTENTO)
                                .setMaximumInterval(Duration.ofMinutes(1))
                                .build()));
        flotaCompensacion = Workflow.newActivityStub(
                ActividadesSaga.Flota.class, opciones("flota", 15, c.scheduleToClose(), compensacion));
    }

    private static RetryOptions noReintentar(String... codigos) {
        return RetryOptions.newBuilder(REINTENTO).setDoNotRetry(codigos).build();
    }

    private static ActivityOptions opciones(
            String cola, int startToCloseSegundos, Duration scheduleToClose, RetryOptions reintento) {
        var b = ActivityOptions.newBuilder()
                .setTaskQueue(cola)
                .setStartToCloseTimeout(Duration.ofSeconds(startToCloseSegundos))
                .setRetryOptions(reintento);
        if (scheduleToClose != null) b.setScheduleToCloseTimeout(scheduleToClose);
        return b.build();
    }
}
