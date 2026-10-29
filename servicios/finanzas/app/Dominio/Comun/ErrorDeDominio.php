<?php

namespace App\Dominio\Comun;

/**
 * Regla de negocio violada. `codigo` es el de specs/000-convenciones.md §5 y decide el estado HTTP; `datos` viaja en el
 * DetalleFallo de las actividades de Temporal (por ejemplo el disponible y el monto de CREDITO_INSUFICIENTE).
 */
class ErrorDeDominio extends \DomainException
{
    /** @param  array<string, mixed>  $datos */
    public function __construct(public readonly string $codigo, string $mensaje, public readonly array $datos = [])
    {
        parent::__construct($mensaje);
    }
}
