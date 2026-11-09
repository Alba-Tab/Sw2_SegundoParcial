<?php

namespace App\Aplicacion\Saga;

use App\Dominio\Cotizacion\Cotizacion;
use App\Dominio\Credito\ReservaCredito;

/** Lo que devuelve el paso 2: la reserva y los datos de la cotización que Viajes guarda en el pivote. */
final class ResultadoReserva
{
    /** @param  list<string>  $motivosAprobacion */
    public function __construct(
        public readonly ReservaCredito $reserva,
        public readonly Cotizacion $cotizacion,
        public readonly array $motivosAprobacion,
    ) {}

    public function requiereAprobacion(): bool
    {
        return $this->reserva->estado() === 'PENDIENTE_APROBACION';
    }
}
