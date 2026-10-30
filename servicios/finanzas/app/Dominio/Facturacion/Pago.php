<?php

namespace App\Dominio\Facturacion;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\Uuid7;
use DateTimeImmutable;

/** Pago registrado a mano por administración (spec 008); no tiene estados ni anulación (propuesta §2). */
final class Pago
{
    public const MEDIOS = ['TRANSFERENCIA', 'DEPOSITO', 'EFECTIVO', 'CHEQUE'];

    private function __construct(
        public readonly string $id,
        public readonly string $facturaId,
        public readonly Monto $monto,
        public readonly string $fecha,
        public readonly string $medio,
        public readonly string $referencia,
        public readonly ?string $nota,
        public readonly string $registradoPor,
        public readonly DateTimeImmutable $registradoEn,
    ) {}

    public static function registrar(string $facturaId, Monto $monto, string $fecha, string $medio, string $referencia, ?string $nota,
        string $registradoPor, DateTimeImmutable $ahora): self
    {
        if (! in_array($medio, self::MEDIOS, true)) {
            throw new ErrorDeDominio('VALIDACION', 'medio: valor inválido', ['campo' => 'medio']);
        }

        return new self(Uuid7::nuevo(), $facturaId, $monto, $fecha, $medio, trim($referencia), $nota, $registradoPor, $ahora);
    }

    public static function reconstruir(string $id, string $facturaId, Monto $monto, string $fecha, string $medio, string $referencia,
        ?string $nota, string $registradoPor, DateTimeImmutable $registradoEn): self
    {
        return new self($id, $facturaId, $monto, $fecha, $medio, $referencia, $nota, $registradoPor, $registradoEn);
    }
}
