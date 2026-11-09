<?php

namespace App\Dominio\Facturacion;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\Uuid7;
use DateTimeImmutable;

/**
 * Agregado Factura (specs 006 y 008): documento interno de cobro, una por viaje. EMITIDA → PAGADA_PARCIAL → PAGADA.
 * Vence a los 30 días de la emisión (D04); "vencida" no es un estado: se calcula al leer.
 */
final class Factura
{
    public const DIAS_PARA_VENCER = 30;

    /** @param  array{rutaId: ?string, tipoCarga: ?string, toneladas: ?string, fechaViaje: ?string}  $servicio */
    private function __construct(
        public readonly string $id,
        public readonly string $numero,
        public readonly string $viajeId,
        public readonly string $servicioId,
        public readonly string $clienteId,
        public readonly Monto $monto,
        private Monto $saldo,
        private string $estado,
        public readonly string $emitidaEl,
        public readonly string $venceEl,
        public readonly array $servicio,
    ) {}

    /** @param  array{rutaId: ?string, tipoCarga: ?string, toneladas: ?string, fechaViaje: ?string}  $servicio */
    public static function emitir(string $numero, string $viajeId, string $servicioId, string $clienteId, Monto $monto,
        string $hoy, array $servicio): self
    {
        $vence = (new DateTimeImmutable($hoy))->modify('+'.self::DIAS_PARA_VENCER.' days')->format('Y-m-d');

        return new self(Uuid7::nuevo(), $numero, $viajeId, $servicioId, $clienteId, $monto, $monto, 'EMITIDA', $hoy, $vence, $servicio);
    }

    /** @param  array{rutaId: ?string, tipoCarga: ?string, toneladas: ?string, fechaViaje: ?string}  $servicio */
    public static function reconstruir(string $id, string $numero, string $viajeId, string $servicioId, string $clienteId, Monto $monto,
        Monto $saldo, string $estado, string $emitidaEl, string $venceEl, array $servicio): self
    {
        return new self($id, $numero, $viajeId, $servicioId, $clienteId, $monto, $saldo, $estado, $emitidaEl, $venceEl, $servicio);
    }

    /** Spec 008: el pago baja el saldo; mayor que el saldo es PAGO_EXCEDE_SALDO, sobre una PAGADA es CONFLICTO_ESTADO. */
    public function registrarPago(Monto $pago, string $fecha, string $hoy): void
    {
        if ($this->estado === 'PAGADA') {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', 'La factura ya está pagada');
        }
        if ($pago->esCero()) {
            throw new ErrorDeDominio('VALIDACION', 'monto: debe ser mayor que 0', ['campo' => 'monto']);
        }
        if ($fecha < $this->emitidaEl || $fecha > $hoy) {
            throw new ErrorDeDominio('VALIDACION', 'fecha: debe estar entre la emisión y hoy', ['campo' => 'fecha']);
        }
        if ($pago->esMayorQue($this->saldo)) {
            throw new ErrorDeDominio('PAGO_EXCEDE_SALDO', sprintf('El saldo es %s BOB', $this->saldo->aContrato()['monto']),
                ['saldo' => $this->saldo->aContrato()]);
        }
        $this->saldo = $this->saldo->menos($pago);
        $this->estado = $this->saldo->esCero() ? 'PAGADA' : 'PAGADA_PARCIAL';
    }

    public function saldo(): Monto
    {
        return $this->saldo;
    }

    public function estado(): string
    {
        return $this->estado;
    }

    public function diasVencida(string $hoy): int
    {
        if ($this->saldo->esCero() || $hoy <= $this->venceEl) {
            return 0;
        }

        return (int) (new DateTimeImmutable($this->venceEl))->diff(new DateTimeImmutable($hoy))->days;
    }
}
