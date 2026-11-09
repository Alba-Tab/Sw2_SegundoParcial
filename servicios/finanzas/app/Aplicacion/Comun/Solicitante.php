<?php

namespace App\Aplicacion\Comun;

/** Quién hace la petición, tomado del token (000 §8). */
final class Solicitante
{
    /** @param list<string> $roles */
    public function __construct(public readonly string $sub, public readonly array $roles, public readonly ?string $clienteId) {}

    public function tiene(string $rol): bool
    {
        return in_array($rol, $this->roles, true);
    }

    /** @param list<string> $roles */
    public function tieneAlguno(array $roles): bool
    {
        return array_intersect($roles, $this->roles) !== [];
    }
}
