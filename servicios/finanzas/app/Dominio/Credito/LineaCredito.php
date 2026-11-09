<?php

namespace App\Dominio\Credito;

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;

/**
 * Agregado LineaCredito (D01): disponible = límite − reservado − utilizado. Se crea con el primer ClienteActualizado
 * con 30.000,00 BOB. Cada cambio devuelve una línea nueva; la fila se bloquea con FOR UPDATE al leerla (000 §9).
 * Las reservas ACTIVA y PENDIENTE_APROBACION cuentan en `reservado` (spec 003). Administración puede ajustar el límite y
 * suspenderla (spec 012, G6): suspendida no reserva, pero lo ya reservado sigue su curso.
 */
final class LineaCredito
{
    public const LIMITE_POR_DEFECTO = '30000.00';

    public function __construct(
        public readonly string $clienteId,
        public readonly Monto $limite,
        public readonly Monto $reservado,
        public readonly Monto $utilizado,
        public readonly bool $suspendida = false,
    ) {}

    public static function porDefecto(string $clienteId): self
    {
        return new self($clienteId, Monto::bob(self::LIMITE_POR_DEFECTO), Monto::bob('0'), Monto::bob('0'));
    }

    /** Puede ser 0 pero nunca negativo: el límite nunca se excede (Monto rechaza negativos). */
    public function disponible(): Monto
    {
        return $this->limite->menos($this->reservado)->menos($this->utilizado);
    }

    /** Paso 2 de la saga: suspendida es CREDITO_RECHAZADO; si no, disponible ≥ monto o CREDITO_INSUFICIENTE. */
    public function reservar(Monto $monto): self
    {
        if ($this->suspendida) {
            throw new ErrorDeDominio('CREDITO_RECHAZADO', 'La línea de crédito del cliente está suspendida', ['suspendida' => true]);
        }
        if ($monto->esMayorQue($this->disponible())) {
            throw new ErrorDeDominio('CREDITO_INSUFICIENTE',
                sprintf('El disponible es %s BOB y el servicio cuesta %s BOB', $this->disponible()->aContrato()['monto'], $monto->aContrato()['monto']),
                ['disponible' => $this->disponible()->aContrato(), 'monto' => $monto->aContrato()]);
        }

        return new self($this->clienteId, $this->limite, $this->reservado->mas($monto), $this->utilizado, $this->suspendida);
    }

    /** Compensación del paso 2. */
    public function liberar(Monto $monto): self
    {
        return new self($this->clienteId, $this->limite, $this->sinReserva($monto, 'liberar'), $this->utilizado, $this->suspendida);
    }

    /** Spec 006: la factura consume la reserva; reservado baja y utilizado sube. */
    public function consumir(Monto $monto): self
    {
        return new self($this->clienteId, $this->limite, $this->sinReserva($monto, 'consumir'), $this->utilizado->mas($monto), $this->suspendida);
    }

    /**
     * reservado − monto. Invariante: lo que se libera o consume estaba reservado; si no, la línea y las reservas ya no
     * cuadran y se detiene en vez de dejar `reservado` en 0 sin avisar.
     */
    private function sinReserva(Monto $monto, string $operacion): Monto
    {
        if ($monto->esMayorQue($this->reservado)) {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', sprintf('No se puede %s %s BOB: la línea de %s solo tiene %s BOB reservados',
                $operacion, $monto->aContrato()['monto'], $this->clienteId, $this->reservado->aContrato()['monto']),
                ['reservado' => $this->reservado->aContrato(), 'monto' => $monto->aContrato()]);
        }

        return $this->reservado->menos($monto);
    }

    /** Spec 008: un pago abona la línea; utilizado baja (nunca menos de 0) y el disponible sube. */
    public function abonar(Monto $monto): self
    {
        $utilizado = $monto->esMayorQue($this->utilizado) ? Monto::bob('0') : $this->utilizado->menos($monto);

        return new self($this->clienteId, $this->limite, $this->reservado, $utilizado, $this->suspendida);
    }

    /** G6: el límite nuevo no puede quedar por debajo de lo usado (reservado + utilizado); igual a lo usado deja disponible 0. */
    public function ajustarLimite(Monto $limite): self
    {
        $usado = $this->reservado->mas($this->utilizado);
        if ($usado->esMayorQue($limite)) {
            throw new ErrorDeDominio('LIMITE_MENOR_QUE_USADO', sprintf('El límite no puede ser menor que lo reservado y utilizado (%s BOB)',
                $usado->aContrato()['monto']), ['usado' => $usado->aContrato()]);
        }

        return new self($this->clienteId, $limite, $this->reservado, $this->utilizado, $this->suspendida);
    }

    /** G6: suspender o reactivar; pedir el estado que ya tiene es CONFLICTO_ESTADO. */
    public function cambiarEstado(bool $suspendida): self
    {
        if ($suspendida === $this->suspendida) {
            throw new ErrorDeDominio('CONFLICTO_ESTADO', $suspendida ? 'La línea ya está suspendida' : 'La línea ya está activa');
        }

        return new self($this->clienteId, $this->limite, $this->reservado, $this->utilizado, $suspendida);
    }
}
