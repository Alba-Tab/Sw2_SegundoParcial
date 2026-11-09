<?php

namespace App\Dominio\Catalogo;

use App\Dominio\Comun\Monto;
use App\Dominio\Comun\TipoCarga;

/** Tarifa final por tonelada de (ruta, carga): base de la ruta × factor de la carga, ya multiplicada (D10). */
final class Tarifa
{
    public function __construct(public readonly string $rutaId, public readonly TipoCarga $tipoCarga, public readonly Monto $porTonelada) {}
}
