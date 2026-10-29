<?php

namespace App\Aplicacion\Puertos;

/** Mora (D04): al menos una factura con saldo vencida hace más de 7 días. */
interface EvaluadorMora
{
    public function enMora(string $clienteId): bool;
}
