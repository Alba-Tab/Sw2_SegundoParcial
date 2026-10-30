<?php

namespace App\Aplicacion\Puertos;

use App\Aplicacion\Comun\Solicitante;

/** Esquema común de auditoría (000 §9), dentro de la transacción del cambio. `$quien` null es el sistema. */
interface Auditoria
{
    /** @param  array<string, mixed>  $datos */
    public function registrar(?Solicitante $quien, string $canal, string $accion, string $entidad, string $entidadId, array $datos): void;
}
