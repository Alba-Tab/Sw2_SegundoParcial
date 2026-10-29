<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\VersionDesactualizada;
use App\Dominio\Comun\Monto;
use App\Dominio\Credito\LineaCredito;
use Illuminate\Support\Facades\DB;

final class LineaCreditoRepositorioDb implements LineaCreditoRepositorio
{
    public function porCliente(string $clienteId): ?LineaCredito
    {
        return self::fila(DB::table('linea_credito')->where('cliente_id', $clienteId)->first());
    }

    public function paraActualizar(string $clienteId): ?LineaCredito
    {
        return self::fila(DB::table('linea_credito')->where('cliente_id', $clienteId)->lockForUpdate()->first());
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

    public function actualizar(LineaCredito $l): void
    {
        $cambiadas = DB::table('linea_credito')
            ->where('cliente_id', $l->clienteId)->where('version', $l->version - 1)
            ->update([
                'limite' => $l->limite->aContrato()['monto'],
                'reservado' => $l->reservado->aContrato()['monto'],
                'utilizado' => $l->utilizado->aContrato()['monto'],
                'version' => $l->version,
            ]);
        if ($cambiadas !== 1) {
            throw new VersionDesactualizada("La línea de {$l->clienteId} cambió mientras se actualizaba");
        }
    }

    private static function fila(?object $f): ?LineaCredito
    {
        return $f ? new LineaCredito($f->cliente_id, Monto::bob((string) $f->limite), Monto::bob((string) $f->reservado),
            Monto::bob((string) $f->utilizado), (int) $f->version) : null;
    }
}
