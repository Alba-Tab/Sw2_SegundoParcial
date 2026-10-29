<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Credito\SolicitudAprobacion;

interface SolicitudAprobacionRepositorio
{
    public function porServicio(string $servicioId, bool $bloquear = false): ?SolicitudAprobacion;

    public function guardar(SolicitudAprobacion $solicitud): void;

    /** @return list<SolicitudAprobacion> ordenadas por servicioId (UUIDv7), después del cursor */
    public function listar(?string $estado, ?string $despuesDe, int $limite): array;
}
