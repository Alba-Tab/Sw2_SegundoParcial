<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\PagoRepositorio;
use App\Dominio\Comun\Monto;
use App\Dominio\Facturacion\Pago;
use Illuminate\Support\Facades\DB;

final class PagoRepositorioDb implements PagoRepositorio
{
    public function insertar(Pago $p): void
    {
        DB::table('pago')->insert([
            'pago_id' => $p->id, 'factura_id' => $p->facturaId, 'monto' => $p->monto->aContrato()['monto'], 'fecha' => $p->fecha,
            'medio' => $p->medio, 'referencia' => $p->referencia, 'nota' => $p->nota, 'registrado_por' => $p->registradoPor,
            'registrado_en' => $p->registradoEn,
        ]);
    }

    public function deFactura(string $facturaId): array
    {
        return DB::table('pago')->where('factura_id', $facturaId)->orderBy('registrado_en')->get()
            ->map(fn ($p) => self::fila($p))->values()->all();
    }

    public function porReferencia(string $facturaId, string $medio, string $referencia): ?Pago
    {
        $p = DB::table('pago')->where(['factura_id' => $facturaId, 'medio' => $medio, 'referencia' => $referencia])->first();

        return $p ? self::fila($p) : null;
    }

    private static function fila(object $p): Pago
    {
        return Pago::reconstruir($p->pago_id, $p->factura_id, Monto::bob((string) $p->monto), $p->fecha, $p->medio, $p->referencia,
            $p->nota, $p->registrado_por, new \DateTimeImmutable($p->registrado_en, new \DateTimeZone('UTC')));
    }
}
