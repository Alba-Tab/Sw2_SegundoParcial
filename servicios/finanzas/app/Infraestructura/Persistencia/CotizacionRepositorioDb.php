<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\TipoCarga;
use App\Dominio\Cotizacion\Cotizacion;
use Illuminate\Support\Facades\DB;

final class CotizacionRepositorioDb implements CotizacionRepositorio
{
    public function guardar(Cotizacion $c): void
    {
        DB::table('cotizacion')->updateOrInsert(['cotizacion_id' => $c->id], [
            'cliente_id' => $c->clienteId,
            'ruta_id' => $c->rutaId,
            'tipo_carga' => $c->tipoCarga->value,
            'toneladas' => $c->toneladas,
            'fecha_viaje' => $c->fechaViaje,
            'tarifa' => $c->tarifaPorTonelada->aContrato()['monto'],
            'monto' => $c->monto->aContrato()['monto'],
            'estado' => $c->estado(),
            'vence_en' => $c->venceEn,
            'canal' => $c->canal,
            'creada_en' => $c->creadaEn,
        ]);
    }

    public function porId(string $id): ?Cotizacion
    {
        $f = DB::table('cotizacion')->where('cotizacion_id', $id)->first();

        return $f ? self::fila($f) : null;
    }

    public function paraActualizar(string $id): ?Cotizacion
    {
        $f = DB::table('cotizacion')->where('cotizacion_id', $id)->lockForUpdate()->first();

        return $f ? self::fila($f) : null;
    }

    public function listar(?string $clienteId, ?string $despuesDe, int $limite): array
    {
        return DB::table('cotizacion')
            ->when($clienteId, fn ($q) => $q->where('cliente_id', $clienteId))
            ->when($despuesDe, fn ($q) => $q->where('cotizacion_id', '>', $despuesDe))
            ->orderBy('cotizacion_id')->limit($limite)->get()
            ->map(fn ($f) => self::fila($f))->all();
    }

    private static function fila(object $f): Cotizacion
    {
        $utc = new \DateTimeZone('UTC');

        return Cotizacion::reconstruir($f->cotizacion_id, $f->cliente_id, $f->ruta_id, TipoCarga::from($f->tipo_carga),
            rtrim(rtrim((string) $f->toneladas, '0'), '.'), $f->fecha_viaje, Monto::bob((string) $f->tarifa), Monto::bob((string) $f->monto),
            $f->estado, new \DateTimeImmutable($f->vence_en, $utc), $f->canal, new \DateTimeImmutable($f->creada_en, $utc));
    }
}
