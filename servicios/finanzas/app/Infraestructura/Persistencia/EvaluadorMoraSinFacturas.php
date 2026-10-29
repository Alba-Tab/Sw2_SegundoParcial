<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\EvaluadorMora;

/** Hasta que existan las facturas (T4.4 y F5) ningún cliente está en mora. T4.4 lo reemplaza por la consulta real (D04). */
final class EvaluadorMoraSinFacturas implements EvaluadorMora
{
    public function enMora(string $clienteId): bool
    {
        return false;
    }
}
