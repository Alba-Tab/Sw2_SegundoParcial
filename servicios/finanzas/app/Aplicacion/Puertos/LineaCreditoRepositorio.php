<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Credito\LineaCredito;

interface LineaCreditoRepositorio
{
    public function porCliente(string $clienteId): ?LineaCredito;

    public function crear(LineaCredito $linea): void;
}
