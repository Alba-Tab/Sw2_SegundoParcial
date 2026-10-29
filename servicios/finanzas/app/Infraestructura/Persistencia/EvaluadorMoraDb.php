<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\EvaluadorMora;
use App\Dominio\Comun\Monto;
use Illuminate\Support\Facades\DB;

/** D04 sobre la tabla factura: saldo > 0 y vencida hace más de 7 días, con la fecha de hoy en La Paz. */
final class EvaluadorMoraDb implements EvaluadorMora
{
    private const DIAS_DE_GRACIA = 7;

    public function enMora(string $clienteId, \DateTimeImmutable $ahora): bool
    {
        $limite = self::hoy($ahora)->modify('-'.self::DIAS_DE_GRACIA.' days')->format('Y-m-d');

        return DB::table('factura')->where('cliente_id', $clienteId)->where('saldo', '>', 0)
            ->where('vence_el', '<', $limite)->exists();
    }

    public function facturasVencidas(string $clienteId, \DateTimeImmutable $ahora): array
    {
        $hoy = self::hoy($ahora);

        return DB::table('factura')->where('cliente_id', $clienteId)->where('saldo', '>', 0)
            ->where('vence_el', '<', $hoy->format('Y-m-d'))->orderBy('vence_el')->get()
            ->map(fn ($f) => [
                'facturaId' => $f->factura_id,
                'numero' => $f->numero,
                'saldo' => Monto::bob((string) $f->saldo)->aContrato(),
                'venceEl' => $f->vence_el,
                'diasVencida' => (int) (new \DateTimeImmutable($f->vence_el))->diff($hoy)->days,
            ])->values()->all();
    }

    private static function hoy(\DateTimeImmutable $ahora): \DateTimeImmutable
    {
        return new \DateTimeImmutable($ahora->setTimezone(new \DateTimeZone('America/La_Paz'))->format('Y-m-d'));
    }
}
