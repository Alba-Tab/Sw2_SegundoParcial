<?php

namespace App\Aplicacion\Saga;

/**
 * Consumidor de ViajeCancelado (spec 004). Libera la reserva del servicio venga de donde venga: así se liberan solas las
 * que quedaron sin compensar tras una intervención resuelta a mano (spec 011). Con `origen = USUARIO` la cotización sigue
 * ACEPTADA; con `origen = SAGA` vuelve a VIGENTE si sigue en plazo. Corre dentro de la transacción del Inbox.
 */
final class LiberarPorCancelacion
{
    public function __construct(private readonly LiberarCredito $liberar) {}

    /** @param array<string, mixed> $datos contratos/eventos/viajes/ViajeCancelado.v1 */
    public function viajeCancelado(array $datos): void
    {
        $this->liberar->ejecutar($datos['servicioId'], $datos['motivo'], devolverCotizacion: $datos['origen'] === 'SAGA');
    }
}
