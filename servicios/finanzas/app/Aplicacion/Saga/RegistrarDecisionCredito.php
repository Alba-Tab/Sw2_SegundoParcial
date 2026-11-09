<?php

namespace App\Aplicacion\Saga;

use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Puertos\ReservaCreditoRepositorio;
use App\Aplicacion\Puertos\SolicitudAprobacionRepositorio;
use App\Dominio\Comun\ErrorDeDominio;

/**
 * Actividad Finanzas.registrarDecisionCredito (spec 012, paso 5 y 6). Aprobada: la reserva pasa a ACTIVA. Rechazada o
 * vencida: solo cambia la solicitud; la reserva la libera la compensación Finanzas.liberarCredito.
 */
final class RegistrarDecisionCredito
{
    public function __construct(
        private readonly SolicitudAprobacionRepositorio $solicitudes,
        private readonly ReservaCreditoRepositorio $reservas,
        private readonly Reloj $reloj,
    ) {}

    public function ejecutar(string $servicioId, string $decision, string $aprobadoPor, ?string $motivo): void
    {
        $solicitud = $this->solicitudes->porServicio($servicioId, bloquear: true)
            ?? throw new ErrorDeDominio('VALIDACION', 'El servicio no tiene solicitud de aprobación');
        $solicitud->decidir($decision, $aprobadoPor, $motivo, $this->reloj->ahora());
        $this->solicitudes->guardar($solicitud);

        if ($decision === 'APROBADA') {
            $reserva = $this->reservas->paraActualizar($servicioId)
                ?? throw new ErrorDeDominio('VALIDACION', 'El servicio no tiene reserva de crédito');
            $reserva->aprobar();
            $this->reservas->guardar($reserva);
        }
    }
}
