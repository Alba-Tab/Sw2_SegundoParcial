<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Dominio\Comun\Monto;
use App\Dominio\Credito\LineaCredito;
use Illuminate\Support\Facades\DB;

final class LineaCreditoRepositorioDb implements LineaCreditoRepositorio
{
    public function porCliente(string $clienteId): ?LineaCredito
    {
        $f = DB::table('linea_credito')->where('cliente_id', $clienteId)->first();

        return $f ? new LineaCredito($f->cliente_id, Monto::bob((string) $f->limite), Monto::bob((string) $f->reservado),
            Monto::bob((string) $f->utilizado), (int) $f->version) : null;
    }

    public function crear(LineaCredito $l): void
    {
        DB::table('linea_credito')->insertOrIgnore([
            'cliente_id' => $l->clienteId,
            'limite' => $l->limite->aContrato()['monto'],
            'reservado' => $l->reservado->aContrato()['monto'],
            'utilizado' => $l->utilizado->aContrato()['monto'],
            'version' => $l->version,
        ]);
    }
}
