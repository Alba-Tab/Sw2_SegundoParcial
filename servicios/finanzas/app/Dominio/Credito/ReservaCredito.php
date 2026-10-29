<?php

namespace App\Dominio\Credito;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\Uuid7;

/**
 * Reserva de crédito de un servicio (spec 003 y 012); `servicioId` es la llave de idempotencia de las actividades.
 * — → ACTIVA o PENDIENTE_APROBACION → ACTIVA (aprobada) → CONSUMIDA (al facturar, spec 006) o LIBERADA.
 */
final class ReservaCredito
{
    private function __construct(
        public readonly string $id,
        public readonly string $servicioId,
        public readonly string $clienteId,
        public readonly string $cotizacionId,
        public readonly Monto $monto,
        private string $estado,
        private ?string $motivoLiberacion,
    ) {}

    public static function crear(string $servicioId, string $clienteId, string $cotizacionId, Monto $monto, bool $requiereAprobacion): self
    {
        return new self(Uuid7::nuevo(), $servicioId, $clienteId, $cotizacionId, $monto,
            $requiereAprobacion ? 'PENDIENTE_APROBACION' : 'ACTIVA', null);
    }

    public static function reconstruir(string $id, string $servicioId, string $clienteId, string $cotizacionId, Monto $monto,
        string $estado, ?string $motivoLiberacion): self
    {
        return new self($id, $servicioId, $clienteId, $cotizacionId, $monto, $estado, $motivoLiberacion);
    }

    public function estado(): string
    {
        return $this->estado;
    }

    public function motivoLiberacion(): ?string
    {
        return $this->motivoLiberacion;
    }

    /** Administración aprobó (spec 012). Repetir no es error: la actividad se puede reintentar. */
    public function aprobar(): void
    {
        if ($this->estado === 'ACTIVA') {
            return;
        }
        if ($this->estado !== 'PENDIENTE_APROBACION') {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', "La reserva está {$this->estado} y no se puede aprobar");
        }
        $this->estado = 'ACTIVA';
    }

    /** @return bool false si ya estaba liberada (reintento de la compensación) */
    public function liberar(string $motivo): bool
    {
        if ($this->estado === 'LIBERADA') {
            return false;
        }
        if ($this->estado === 'CONSUMIDA') {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', 'La reserva ya se consumió al facturar');
        }
        $this->estado = 'LIBERADA';
        $this->motivoLiberacion = $motivo;

        return true;
    }
}
