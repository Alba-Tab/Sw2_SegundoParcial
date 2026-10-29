<?php

namespace App\Aplicacion\Saga;

use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Puertos\ReservaCreditoRepositorio;

/**
 * Compensación Finanzas.liberarCredito (spec 003) y liberación por ViajeCancelado (spec 004): reserva LIBERADA con el
 * motivo y el monto vuelve al disponible. La cotización vuelve a VIGENTE si sigue en plazo, salvo en una cancelación del
 * usuario (no se reutiliza). Sin reserva (el paso 2 falló antes de reservar) o ya liberada: no hace nada.
 */
final class LiberarCredito
{
    public function __construct(
        private readonly ReservaCreditoRepositorio $reservas,
        private readonly LineaCreditoRepositorio $lineas,
        private readonly CotizacionRepositorio $cotizaciones,
        private readonly Reloj $reloj,
    ) {}

    public function ejecutar(string $servicioId, string $motivo, bool $devolverCotizacion = true): void
    {
        $reserva = $this->reservas->paraActualizar($servicioId);
        if ($reserva === null || ! $reserva->liberar($motivo)) {
            return;
        }
        $linea = $this->lineas->paraActualizar($reserva->clienteId);
        if ($linea !== null) {
            $this->lineas->actualizar($linea->liberar($reserva->monto));
        }
        $cotizacion = $devolverCotizacion ? $this->cotizaciones->paraActualizar($reserva->cotizacionId) : null;
        if ($cotizacion !== null) {
            $cotizacion->volverAVigente($this->reloj->ahora());
            $this->cotizaciones->guardar($cotizacion);
        }
        $this->reservas->guardar($reserva);
    }
}
