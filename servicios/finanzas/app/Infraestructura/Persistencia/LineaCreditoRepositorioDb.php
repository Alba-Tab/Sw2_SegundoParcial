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
        return self::fila(DB::table('linea_credito')->where('cliente_id', $clienteId)->first());
    }

    public function porClientes(array $clienteIds): array
    {
        return DB::table('linea_credito')->whereIn('cliente_id', $clienteIds)->get()
            ->map(fn (object $f) => self::desde($f))->values()->all();
    }

    public function paraActualizar(string $clienteId): ?LineaCredito
    {
        return self::fila(DB::table('linea_credito')->where('cliente_id', $clienteId)->lockForUpdate()->first());
    }

    public function crear(LineaCredito $l): void
    {
        DB::table('linea_credito')->insertOrIgnore(['cliente_id' => $l->clienteId] + self::columnas($l));
    }

    public function actualizar(LineaCredito $l): void
    {
        DB::table('linea_credito')->where('cliente_id', $l->clienteId)->update(self::columnas($l));
    }

    /** @return array<string, string|bool> */
    private static function columnas(LineaCredito $l): array
    {
        return [
            'limite' => $l->limite->aContrato()['monto'],
            'reservado' => $l->reservado->aContrato()['monto'],
            'utilizado' => $l->utilizado->aContrato()['monto'],
            'suspendida' => $l->suspendida,
        ];
    }

    private static function fila(?object $f): ?LineaCredito
    {
        return $f ? self::desde($f) : null;
    }

    private static function desde(object $f): LineaCredito
    {
        return new LineaCredito($f->cliente_id, Monto::bob((string) $f->limite), Monto::bob((string) $f->reservado),
            Monto::bob((string) $f->utilizado), (bool) $f->suspendida);
    }
}
