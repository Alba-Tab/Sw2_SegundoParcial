<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Cotizacion\Cotizacion;

interface CotizacionRepositorio
{
    public function guardar(Cotizacion $c): void;

    public function porId(string $id): ?Cotizacion;

    /** Lee la cotización bloqueando su fila hasta el fin de la transacción. */
    public function paraActualizar(string $id): ?Cotizacion;

    /** @return list<Cotizacion> ordenadas por id (UUIDv7), después del cursor */
    public function listar(?string $clienteId, ?string $despuesDe, int $limite): array;
}
