<?php

namespace App\Aplicacion\Credito;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\EvaluadorMora;
use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Puertos\SolicitudAprobacionRepositorio;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Credito\SolicitudAprobacion;

/** GET /solicitudes-aprobacion (spec 012): solo administración y gerente. El detalle trae las facturas vencidas. */
final class ConsultarSolicitudes
{
    private const PUEDEN_VER = ['administracion', 'gerente'];

    public function __construct(
        private readonly SolicitudAprobacionRepositorio $solicitudes,
        private readonly EvaluadorMora $mora,
        private readonly Reloj $reloj,
    ) {}

    /** @return list<SolicitudAprobacion> */
    public function listar(Solicitante $quien, ?string $estado, ?string $despuesDe, int $limite): array
    {
        $this->autorizar($quien);

        return $this->solicitudes->listar($estado, $despuesDe, $limite);
    }

    /** @return array{0: SolicitudAprobacion, 1: list<array<string, mixed>>} la solicitud y las facturas vencidas del cliente */
    public function detalle(Solicitante $quien, string $servicioId): array
    {
        $this->autorizar($quien);
        $s = $this->solicitudes->porServicio($servicioId)
            ?? throw new ErrorDeDominio('NO_ENCONTRADO', 'El servicio no tiene solicitud de aprobación');

        return [$s, $this->mora->facturasVencidas($s->clienteId, $this->reloj->ahora())];
    }

    private function autorizar(Solicitante $quien): void
    {
        if (! $quien->tieneAlguno(self::PUEDEN_VER)) {
            throw new ErrorDeDominio('SIN_PERMISO', 'Solo administración y gerencia ven las solicitudes');
        }
    }
}
