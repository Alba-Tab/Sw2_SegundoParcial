<?php

namespace App\Aplicacion\Saga;

use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Aplicacion\Puertos\EvaluadorMora;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Puertos\ReservaCreditoRepositorio;
use App\Aplicacion\Puertos\SolicitudAprobacionRepositorio;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Credito\ReservaCredito;
use App\Dominio\Credito\SolicitudAprobacion;
use DateInterval;

/**
 * Actividad Finanzas.validarYReservarCredito (spec 003, paso 2). Se llama dentro de una transacción. Orden: cotización
 * del cliente y VIGENTE → disponible ≥ monto → mora o monto alto deja la reserva PENDIENTE_APROBACION con su
 * SolicitudAprobacion (spec 012). Idempotente por servicioId: un reintento devuelve la reserva ya hecha.
 */
final class ValidarYReservarCredito
{
    public function __construct(
        private readonly CotizacionRepositorio $cotizaciones,
        private readonly LineaCreditoRepositorio $lineas,
        private readonly ReservaCreditoRepositorio $reservas,
        private readonly SolicitudAprobacionRepositorio $solicitudes,
        private readonly CatalogoRepositorio $catalogo,
        private readonly EvaluadorMora $mora,
        private readonly Reloj $reloj,
    ) {}

    public function ejecutar(string $servicioId, string $clienteId, string $cotizacionId, DateInterval $esperaAprobacion): ResultadoReserva
    {
        $previa = $this->reservas->paraActualizar($servicioId);
        if ($previa !== null) {
            return $this->repetido($previa, $clienteId, $cotizacionId);
        }

        if (! $this->catalogo->clienteReplicado($clienteId)) {
            throw new ErrorDeDominio('CLIENTE_NO_REPLICADO', 'El cliente todavía no llegó a Finanzas');
        }
        $ahora = $this->reloj->ahora();
        $cotizacion = $this->cotizaciones->paraActualizar($cotizacionId)
            ?? throw new ErrorDeDominio('COTIZACION_AJENA', 'La cotización no existe');
        // Un intento simultáneo de la misma actividad pudo reservar mientras se esperaba el bloqueo de la cotización:
        // se vuelve a buscar la reserva con el bloqueo ya tomado.
        $previa = $this->reservas->paraActualizar($servicioId);
        if ($previa !== null) {
            return $this->repetido($previa, $clienteId, $cotizacionId);
        }
        $cotizacion->aceptar($clienteId, $ahora);

        $linea = $this->lineas->paraActualizar($clienteId)
            ?? throw new ErrorDeDominio('CLIENTE_NO_REPLICADO', 'El cliente todavía no tiene línea de crédito');
        $linea = $linea->reservar($cotizacion->monto);

        $motivos = SolicitudAprobacion::motivos($this->mora->enMora($clienteId, $ahora), $cotizacion->monto);
        $reserva = ReservaCredito::crear($servicioId, $clienteId, $cotizacionId, $cotizacion->monto, $motivos !== []);

        $this->cotizaciones->guardar($cotizacion);
        $this->lineas->actualizar($linea);
        $this->reservas->guardar($reserva);
        if ($motivos !== []) {
            $this->solicitudes->guardar(SolicitudAprobacion::crear($servicioId, $clienteId, $cotizacion->monto, $motivos, $ahora, $esperaAprobacion));
        }

        return new ResultadoReserva($reserva, $cotizacion, $motivos);
    }

    /**
     * Reintento de la actividad: devuelve la reserva ya hecha si es de la misma petición. Otro cliente u otra cotización
     * con el mismo servicioId, o una reserva ya LIBERADA, es CONFLICTO_ESTADO (no reintentable).
     */
    private function repetido(ReservaCredito $previa, string $clienteId, string $cotizacionId): ResultadoReserva
    {
        if ($previa->clienteId !== $clienteId || $previa->cotizacionId !== $cotizacionId) {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', 'El servicio ya tiene una reserva con otro cliente o cotización');
        }
        if ($previa->estado() === 'LIBERADA') {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', 'La reserva del servicio ya se liberó');
        }
        $cotizacion = $this->cotizaciones->porId($previa->cotizacionId) ?? throw new \LogicException('Reserva sin cotización');

        return new ResultadoReserva($previa, $cotizacion, $this->solicitudes->porServicio($previa->servicioId)->motivos ?? []);
    }
}
