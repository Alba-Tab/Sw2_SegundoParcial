<?php

namespace App\Dominio\Comun;

use Brick\Math\Exception\MathException;
use Brick\Math\RoundingMode;
use Brick\Money\Money;

/**
 * Dinero (000 §3): Brick\Money con 2 decimales, HALF_UP solo al final, BOB y nunca negativo. Inmutable.
 * El JSON del contrato es {"monto": "2800.00", "moneda": "BOB"}.
 */
final class Monto
{
    private function __construct(private readonly Money $valor)
    {
        if ($valor->isNegative()) {
            throw new ErrorDeDominio('VALIDACION', 'El monto no puede ser negativo');
        }
    }

    public static function bob(string $monto): self
    {
        try {
            return new self(Money::of($monto, 'BOB', roundingMode: RoundingMode::HalfUp));
        } catch (MathException) {
            throw new ErrorDeDominio('VALIDACION', "Monto inválido: {$monto}");
        }
    }

    /** @param array{monto: string, moneda: string} $m */
    public static function desdeContrato(array $m): self
    {
        if ($m['moneda'] !== 'BOB') {
            throw new ErrorDeDominio('VALIDACION', "Moneda no soportada: {$m['moneda']}");
        }

        return self::bob($m['monto']);
    }

    public function mas(self $otro): self
    {
        return new self($this->valor->plus($otro->valor));
    }

    public function menos(self $otro): self
    {
        return new self($this->valor->minus($otro->valor));
    }

    public function por(string $factor): self
    {
        return new self($this->valor->multipliedBy($factor, RoundingMode::HalfUp));
    }

    public function esCero(): bool
    {
        return $this->valor->isZero();
    }

    public function esMayorQue(self $otro): bool
    {
        return $this->valor->isGreaterThan($otro->valor);
    }

    /** @return array{monto: string, moneda: string} */
    public function aContrato(): array
    {
        return ['monto' => (string) $this->valor->getAmount(), 'moneda' => 'BOB'];
    }
}
