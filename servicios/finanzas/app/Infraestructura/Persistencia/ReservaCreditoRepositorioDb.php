<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\ReservaCreditoRepositorio;
use App\Dominio\Comun\Monto;
use App\Dominio\Credito\ReservaCredito;
use Illuminate\Support\Facades\DB;

final class ReservaCreditoRepositorioDb implements ReservaCreditoRepositorio
{
    public function paraActualizar(string $servicioId): ?ReservaCredito
    {
        $f = DB::table('reserva_credito')->where('servicio_id', $servicioId)->lockForUpdate()->first();

        return $f ? ReservaCredito::reconstruir($f->reserva_credito_id, $f->servicio_id, $f->cliente_id, $f->cotizacion_id,
            Monto::bob((string) $f->monto), $f->estado, $f->motivo_liberacion) : null;
    }

    public function guardar(ReservaCredito $r): void
    {
        DB::table('reserva_credito')->upsert([[
            'reserva_credito_id' => $r->id,
            'servicio_id' => $r->servicioId,
            'cliente_id' => $r->clienteId,
            'cotizacion_id' => $r->cotizacionId,
            'monto' => $r->monto->aContrato()['monto'],
            'estado' => $r->estado(),
            'motivo_liberacion' => $r->motivoLiberacion(),
            'actualizada_en' => now(),
        ]], ['reserva_credito_id'], ['estado', 'motivo_liberacion', 'actualizada_en']);
    }
}
