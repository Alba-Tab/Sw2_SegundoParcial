<?php

namespace App\Aplicacion\Puertos;

/**
 * Deja un evento para publicar dentro de la transacción en curso (Outbox, 000 §6). Fuera de una transacción falla.
 * Nunca publica directo al broker.
 */
interface RegistroDeEventos
{
    /** @param array<string, mixed> $datos contenido de `datos` del sobre; debe cumplir contratos/eventos */
    public function registrar(string $tipo, string $claveEnrutamiento, array $datos): void;
}
