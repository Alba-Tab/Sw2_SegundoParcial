<?php

namespace App\Aplicacion\Saga;

/**
 * Consumidor de EntregaRechazada (spec 007, paso 10): no se factura; la reserva queda LIBERADA y la cotización sigue
 * ACEPTADA (no se reutiliza). Corre dentro de la transacción del Inbox.
 */
final class LiberarPorRechazo
{
    public function __construct(private readonly LiberarCredito $liberar) {}

    /** @param array<string, mixed> $datos contratos/eventos/viajes/EntregaRechazada.v1 */
    public function entregaRechazada(array $datos): void
    {
        $this->liberar->ejecutar($datos['servicioId'], 'ENTREGA_RECHAZADA', devolverCotizacion: false);
    }
}
