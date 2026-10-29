<?php

namespace App\Dominio\Credito;

use App\Dominio\Comun\Monto;

/**
 * Agregado LineaCredito (D01): disponible = límite − reservado − utilizado. Se crea con el primer ClienteActualizado
 * con 30.000,00 BOB. `version` es el bloqueo optimista (000 §9). Reservar y liberar llegan con la saga (T4.4).
 */
final class LineaCredito
{
    public const LIMITE_POR_DEFECTO = '30000.00';

    public function __construct(
        public readonly string $clienteId,
        public readonly Monto $limite,
        public readonly Monto $reservado,
        public readonly Monto $utilizado,
        public readonly int $version,
    ) {}

    public static function porDefecto(string $clienteId): self
    {
        return new self($clienteId, Monto::bob(self::LIMITE_POR_DEFECTO), Monto::bob('0'), Monto::bob('0'), 0);
    }

    /** Puede ser 0 pero nunca negativo: el límite nunca se excede (Monto rechaza negativos). */
    public function disponible(): Monto
    {
        return $this->limite->menos($this->reservado)->menos($this->utilizado);
    }
}
