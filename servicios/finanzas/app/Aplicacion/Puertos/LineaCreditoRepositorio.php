<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Credito\LineaCredito;

interface LineaCreditoRepositorio
{
    public function porCliente(string $clienteId): ?LineaCredito;

    /** Lee la línea bloqueando su fila hasta el fin de la transacción. */
    public function paraActualizar(string $clienteId): ?LineaCredito;

    public function crear(LineaCredito $linea): void;

    /** Guarda la línea leída con paraActualizar (su fila sigue bloqueada). */
    public function actualizar(LineaCredito $linea): void;
}
