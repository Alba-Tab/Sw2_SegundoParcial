<?php

namespace App\Dominio\Comun;

/** Regla de negocio violada. `codigo` es el de specs/000-convenciones.md §5 y decide el estado HTTP. */
class ErrorDeDominio extends \DomainException
{
    public function __construct(public readonly string $codigo, string $mensaje)
    {
        parent::__construct($mensaje);
    }
}
