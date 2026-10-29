<?php

namespace App\Dominio\Credito;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;

/**
 * Agregado LineaCredito (D01): disponible = límite − reservado − utilizado. Se crea con el primer ClienteActualizado
 * con 30.000,00 BOB. `version` es el bloqueo optimista (000 §9): cada cambio devuelve una línea nueva con version + 1.
 * Las reservas ACTIVA y PENDIENTE_APROBACION cuentan en `reservado` (spec 003).
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

    /** Paso 2 de la saga: disponible ≥ monto o CREDITO_INSUFICIENTE. */
    public function reservar(Monto $monto): self
    {
        if ($monto->esMayorQue($this->disponible())) {
            throw new ErrorDeDominio('CREDITO_INSUFICIENTE',
                sprintf('El disponible es %s BOB y el servicio cuesta %s BOB', $this->disponible()->aContrato()['monto'], $monto->aContrato()['monto']),
                ['disponible' => $this->disponible()->aContrato(), 'monto' => $monto->aContrato()]);
        }

        return new self($this->clienteId, $this->limite, $this->reservado->mas($monto), $this->utilizado, $this->version + 1);
    }

    /** Compensación del paso 2. */
    public function liberar(Monto $monto): self
    {
        $reservado = $monto->esMayorQue($this->reservado) ? Monto::bob('0') : $this->reservado->menos($monto);

        return new self($this->clienteId, $this->limite, $reservado, $this->utilizado, $this->version + 1);
    }
}
