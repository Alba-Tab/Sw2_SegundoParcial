<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Credito\ReservaCredito;

interface ReservaCreditoRepositorio
{
    /** La reserva del servicio, bloqueando su fila hasta el fin de la transacción. */
    public function paraActualizar(string $servicioId): ?ReservaCredito;

    public function guardar(ReservaCredito $reserva): void;
}
