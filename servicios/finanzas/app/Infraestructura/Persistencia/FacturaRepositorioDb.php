<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\FacturaRepositorio;
use App\Dominio\Comun\Monto;
use App\Dominio\Facturacion\Factura;
use Illuminate\Support\Facades\DB;

final class FacturaRepositorioDb implements FacturaRepositorio
{
    public function porId(string $facturaId, bool $bloquear = false): ?Factura
    {
        $f = DB::table('factura')->where('factura_id', $facturaId)->when($bloquear, fn ($q) => $q->lockForUpdate())->first();

        return $f ? self::fila($f) : null;
    }

    public function delViaje(string $viajeId): ?Factura
    {
        $f = DB::table('factura')->where('viaje_id', $viajeId)->first();

        return $f ? self::fila($f) : null;
    }

    public function siguienteNumero(): string
    {
        return sprintf('FAC-%06d', (int) DB::scalar("SELECT nextval('factura_numero_seq')"));
    }

    public function insertar(Factura $f): void
    {
        DB::table('factura')->insert([
            'factura_id' => $f->id, 'numero' => $f->numero, 'viaje_id' => $f->viajeId, 'servicio_id' => $f->servicioId,
            'cliente_id' => $f->clienteId, 'monto' => $f->monto->aContrato()['monto'], 'saldo' => $f->saldo()->aContrato()['monto'],
            'estado' => $f->estado(), 'emitida_el' => $f->emitidaEl, 'vence_el' => $f->venceEl, 'ruta_id' => $f->servicio['rutaId'],
            'tipo_carga' => $f->servicio['tipoCarga'], 'toneladas' => $f->servicio['toneladas'], 'fecha_viaje' => $f->servicio['fechaViaje'],
        ]);
    }

    public function actualizar(Factura $f): void
    {
        DB::table('factura')->where('factura_id', $f->id)
            ->update(['saldo' => $f->saldo()->aContrato()['monto'], 'estado' => $f->estado()]);
    }

    public function listar(array $filtro, ?string $despuesDe, int $limite): array
    {
        return DB::table('factura')
            ->when($filtro['clienteId'] ?? null, fn ($q, $v) => $q->where('cliente_id', $v))
            ->when($filtro['estado'] ?? null, fn ($q, $v) => $q->where('estado', $v))
            ->when(($filtro['conSaldo'] ?? null) === true, fn ($q) => $q->where('saldo', '>', 0))
            ->when($filtro['venceDesde'] ?? null, fn ($q, $v) => $q->where('vence_el', '>=', $v))
            ->when($filtro['venceHasta'] ?? null, fn ($q, $v) => $q->where('vence_el', '<=', $v))
            ->when($despuesDe, fn ($q) => $q->where('factura_id', '>', $despuesDe))
            ->orderBy('factura_id')->limit($limite)->get()
            ->map(fn ($f) => self::fila($f))->values()->all();
    }

    private static function fila(object $f): Factura
    {
        $toneladas = $f->toneladas === null ? null : rtrim(rtrim((string) $f->toneladas, '0'), '.');

        return Factura::reconstruir($f->factura_id, $f->numero, $f->viaje_id, $f->servicio_id, $f->cliente_id, Monto::bob((string) $f->monto),
            Monto::bob((string) $f->saldo), $f->estado, $f->emitida_el, $f->vence_el, [
                'rutaId' => $f->ruta_id, 'tipoCarga' => $f->tipo_carga, 'toneladas' => $toneladas, 'fechaViaje' => $f->fecha_viaje,
            ]);
    }
}
