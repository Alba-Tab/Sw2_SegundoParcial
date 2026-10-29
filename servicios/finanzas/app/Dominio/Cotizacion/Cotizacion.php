<?php

namespace App\Dominio\Cotizacion;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\TipoCarga;
use App\Dominio\Comun\Uuid7;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;

/**
 * Agregado Cotizacion (spec 002). monto = tarifa × toneladas (HALF_UP al final). Estado VIGENTE o ACEPTADA;
 * VENCIDA no se guarda: se calcula con venceEn. Máximo 30 t por servicio (D03); fecha de hoy a 60 días en La Paz.
 * El paso 2 de la saga la acepta y su compensación la devuelve a VIGENTE si sigue en plazo (spec 003).
 */
final class Cotizacion
{
    public const MAXIMO_TONELADAS = '30';

    private function __construct(
        public readonly string $id,
        public readonly string $clienteId,
        public readonly string $rutaId,
        public readonly TipoCarga $tipoCarga,
        public readonly string $toneladas,
        public readonly string $fechaViaje,
        public readonly Monto $tarifaPorTonelada,
        public readonly Monto $monto,
        private string $estado,
        public readonly DateTimeImmutable $venceEn,
        public readonly string $canal,
        public readonly DateTimeImmutable $creadaEn,
    ) {}

    public static function calcular(string $clienteId, string $rutaId, TipoCarga $tipoCarga, string $toneladas, string $fechaViaje,
        Monto $tarifa, string $canal, DateTimeImmutable $ahora, DateInterval $vigencia): self
    {
        if (! is_numeric($toneladas) || bccomp($toneladas, '0', 3) <= 0) {
            throw new ErrorDeDominio('VALIDACION', 'toneladas: debe ser mayor que 0');
        }
        if (bccomp($toneladas, self::MAXIMO_TONELADAS, 3) > 0) {
            throw new ErrorDeDominio('TONELAJE_EXCEDIDO', 'El máximo por servicio es 30 t');
        }
        $hoy = $ahora->setTimezone(new DateTimeZone('America/La_Paz'))->format('Y-m-d');
        $limite = $ahora->setTimezone(new DateTimeZone('America/La_Paz'))->add(new DateInterval('P60D'))->format('Y-m-d');
        if ($fechaViaje < $hoy || $fechaViaje > $limite) {
            throw new ErrorDeDominio('VALIDACION', 'fechaViaje: debe estar entre hoy y 60 días adelante');
        }

        return new self(Uuid7::nuevo(), $clienteId, $rutaId, $tipoCarga, $toneladas, $fechaViaje, $tarifa, $tarifa->por($toneladas),
            'VIGENTE', $ahora->add($vigencia), $canal, $ahora);
    }

    public static function reconstruir(string $id, string $clienteId, string $rutaId, TipoCarga $tipoCarga, string $toneladas,
        string $fechaViaje, Monto $tarifa, Monto $monto, string $estado, DateTimeImmutable $venceEn, string $canal, DateTimeImmutable $creadaEn): self
    {
        return new self($id, $clienteId, $rutaId, $tipoCarga, $toneladas, $fechaViaje, $tarifa, $monto, $estado, $venceEn, $canal, $creadaEn);
    }

    public function estado(): string
    {
        return $this->estado;
    }

    public function vencida(DateTimeImmutable $ahora): bool
    {
        return $this->estado === 'VIGENTE' && $ahora > $this->venceEn;
    }

    /** Paso 2 de la saga, en este orden: del cliente (COTIZACION_AJENA) y VIGENTE en plazo (COTIZACION_VENCIDA). */
    public function aceptar(string $clienteId, DateTimeImmutable $ahora): void
    {
        if ($clienteId !== $this->clienteId) {
            throw new ErrorDeDominio('COTIZACION_AJENA', 'La cotización es de otro cliente');
        }
        if ($this->estado !== 'VIGENTE' || $this->vencida($ahora)) {
            throw new ErrorDeDominio('COTIZACION_VENCIDA',
                $this->estado === 'ACEPTADA' ? 'La cotización ya se usó en otro servicio' : 'La cotización venció');
        }
        $this->estado = 'ACEPTADA';
    }

    /** Compensación del paso 2: vuelve a VIGENTE solo si todavía está en plazo. */
    public function volverAVigente(DateTimeImmutable $ahora): void
    {
        if ($this->estado === 'ACEPTADA' && $ahora <= $this->venceEn) {
            $this->estado = 'VIGENTE';
        }
    }
}
