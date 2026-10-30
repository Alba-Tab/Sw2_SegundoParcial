<?php

namespace App\Infraestructura\Consola;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Carga la parte de Finanzas de plataforma/semilla (D102): copias de clientes y rutas, tarifas (D10), facturas y líneas
 * de crédito, con las fechas relativas resueltas a hoy en La Paz. Escribe directo en la base, sin Outbox ni Inbox: no
 * dispara eventos. Es idempotente (UPSERT por id); `demo:reiniciar` (T8.8) borra antes de llamarla.
 */
final class CargarSemilla extends Command
{
    protected $signature = 'semilla:cargar';

    protected $description = 'Carga la semilla de demo de Finanzas';

    public function handle(): int
    {
        $dir = rtrim((string) config('servicio.semilla'), '/');
        $leer = fn (string $archivo): array => json_decode((string) file_get_contents("$dir/$archivo"), true, flags: JSON_THROW_ON_ERROR);
        $hoy = new \DateTimeImmutable('today', new \DateTimeZone('America/La_Paz'));
        $dia = fn (int $dias): string => $hoy->modify(sprintf('%+d days', $dias))->format('Y-m-d');

        $clientes = $leer('clientes.json');
        $rutas = $leer('rutas.json');
        $facturas = $leer('facturas.json');

        DB::transaction(function () use ($clientes, $rutas, $facturas, $leer, $dia) {
            foreach ($clientes as $c) {
                DB::table('cliente_copia')->upsert([[
                    'cliente_id' => $c['clienteId'], 'razon_social' => $c['razonSocial'], 'nit' => $c['nit'], 'correo' => $c['correo'],
                    'telefono' => $c['telefono'], 'direccion' => $c['direccion'], 'canal' => $c['canal'],
                    'tiene_cuenta' => $c['sub'] !== null, 'activo' => true, 'version_agregado' => 1,
                ]], ['cliente_id'], ['razon_social', 'nit', 'correo', 'telefono', 'direccion', 'canal', 'tiene_cuenta', 'activo']);
            }
            foreach ($rutas as $r) {
                DB::table('ruta_copia')->upsert([[
                    'ruta_id' => $r['rutaId'], 'nombre' => $r['nombre'], 'distancia_km' => $r['distanciaKm'], 'activa' => true,
                    'version_agregado' => 1, 'datos' => json_encode($r + ['activa' => true, 'versionAgregado' => 1], JSON_UNESCAPED_UNICODE),
                ]], ['ruta_id'], ['nombre', 'distancia_km', 'activa', 'datos']);
            }
            DB::table('tarifa')->upsert(array_map(fn ($t) => [
                'ruta_id' => $t['rutaId'], 'tipo_carga' => $t['tipoCarga'], 'por_tonelada' => $t['porTonelada'],
            ], $leer('tarifas.json')), ['ruta_id', 'tipo_carga'], ['por_tonelada']);

            foreach ($facturas as $f) {
                $estado = bccomp($f['saldo'], '0', 2) === 0 ? 'PAGADA' : (bccomp($f['saldo'], $f['monto'], 2) === 0 ? 'EMITIDA' : 'PAGADA_PARCIAL');
                DB::table('factura')->upsert([[
                    'factura_id' => $f['facturaId'], 'numero' => $f['numero'], 'viaje_id' => $f['viajeId'], 'servicio_id' => $f['servicioId'],
                    'cliente_id' => $f['clienteId'], 'monto' => $f['monto'], 'saldo' => $f['saldo'], 'estado' => $estado,
                    'emitida_el' => $dia($f['emitidaElDiasDesdeHoy']), 'vence_el' => $dia($f['venceElDiasDesdeHoy']),
                    'ruta_id' => $f['rutaId'], 'tipo_carga' => $f['tipoCarga'], 'toneladas' => $f['toneladas'],
                    'fecha_viaje' => $dia($f['fechaViajeDiasDesdeHoy']),
                ]], ['factura_id'], ['saldo', 'estado', 'emitida_el', 'vence_el', 'fecha_viaje']);
            }
            DB::statement("SELECT setval('factura_numero_seq', (SELECT COALESCE(MAX(substring(numero from 5)::int), 0) + 1 FROM factura), false)");

            // utilizado = saldo de las facturas del cliente (D01): "Agro Moroso" queda con 25.000 disponibles.
            foreach ($clientes as $c) {
                $utilizado = array_reduce(array_filter($facturas, fn ($f) => $f['clienteId'] === $c['clienteId']),
                    fn (string $suma, array $f) => bcadd($suma, $f['saldo'], 2), '0.00');
                DB::table('linea_credito')->upsert([[
                    'cliente_id' => $c['clienteId'], 'limite' => $c['limiteCredito'], 'reservado' => '0.00', 'utilizado' => $utilizado, 'version' => 0,
                ]], ['cliente_id'], ['limite', 'utilizado']);
            }
        });

        $this->info(sprintf('Semilla de Finanzas: %d clientes, %d rutas, %d facturas', count($clientes), count($rutas), count($facturas)));

        return self::SUCCESS;
    }
}
