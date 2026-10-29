<?php

namespace App\Dominio\Credito;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use DateInterval;
use DateTimeImmutable;

/**
 * Paso 2b (spec 012, D16): el servicio espera que administración apruebe por mora (D04) o monto alto (D05).
 * PENDIENTE → APROBADA, RECHAZADA o VENCIDA. La decisión queda en la propia solicitud (D19: sin eventos de crédito).
 */
final class SolicitudAprobacion
{
    /** D05: más de 15.000,00 BOB. */
    public const MONTO_ALTO = '15000.00';

    public const DECISIONES = ['APROBADA', 'RECHAZADA', 'VENCIDA'];

    /** @param  list<string>  $motivos */
    private function __construct(
        public readonly string $servicioId,
        public readonly string $clienteId,
        public readonly Monto $monto,
        public readonly array $motivos,
        private string $estado,
        public readonly DateTimeImmutable $creadaEn,
        public readonly DateTimeImmutable $venceEn,
        private ?string $decididaPor,
        private ?DateTimeImmutable $decididaEn,
        private ?string $motivoDecision,
    ) {}

    /** @return list<string> MORA y/o MONTO_ALTO; vacío si no requiere aprobación */
    public static function motivos(bool $enMora, Monto $monto): array
    {
        return array_values(array_filter([
            $enMora ? 'MORA' : null,
            $monto->esMayorQue(Monto::bob(self::MONTO_ALTO)) ? 'MONTO_ALTO' : null,
        ]));
    }

    /** @param  list<string>  $motivos */
    public static function crear(string $servicioId, string $clienteId, Monto $monto, array $motivos, DateTimeImmutable $ahora,
        DateInterval $espera): self
    {
        return new self($servicioId, $clienteId, $monto, $motivos, 'PENDIENTE', $ahora, $ahora->add($espera), null, null, null);
    }

    /** @param  list<string>  $motivos */
    public static function reconstruir(string $servicioId, string $clienteId, Monto $monto, array $motivos, string $estado,
        DateTimeImmutable $creadaEn, DateTimeImmutable $venceEn, ?string $decididaPor, ?DateTimeImmutable $decididaEn,
        ?string $motivoDecision): self
    {
        return new self($servicioId, $clienteId, $monto, $motivos, $estado, $creadaEn, $venceEn, $decididaPor, $decididaEn, $motivoDecision);
    }

    /**
     * Registra la decisión del workflow. Repetir la misma decisión no es error (reintento de la actividad);
     * otra decisión sobre una solicitud ya decidida es CONFLICTO_ESTADO.
     */
    public function decidir(string $decision, string $por, ?string $motivo, DateTimeImmutable $ahora): void
    {
        if (! in_array($decision, self::DECISIONES, true)) {
            throw new ErrorDeDominio('VALIDACION', "decision: valor inválido {$decision}");
        }
        if ($this->estado === $decision) {
            return;
        }
        if ($this->estado !== 'PENDIENTE') {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', "La solicitud ya está {$this->estado}");
        }
        $this->estado = $decision;
        $this->decididaPor = $por;
        $this->decididaEn = $ahora;
        $this->motivoDecision = $motivo ?? ($decision === 'VENCIDA' ? 'Plazo de aprobación vencido' : null);
    }

    public function estado(): string
    {
        return $this->estado;
    }

    public function decididaPor(): ?string
    {
        return $this->decididaPor;
    }

    public function decididaEn(): ?DateTimeImmutable
    {
        return $this->decididaEn;
    }

    public function motivoDecision(): ?string
    {
        return $this->motivoDecision;
    }
}
