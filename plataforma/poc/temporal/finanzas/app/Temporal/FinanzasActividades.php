<?php

namespace App\Temporal;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Temporal\Activity\ActivityInterface;
use Temporal\Activity\ActivityMethod;
use Temporal\DataConverter\EncodedValues;
use Temporal\Exception\Failure\ApplicationFailure;

/**
 * Actividades Finanzas.* de la PoC-2. Reserva en PostgreSQL con el query builder de Laravel (idempotente por servicio_id)
 * y devuelve el ejemplo del contrato como resultado (S15).
 */
#[ActivityInterface(prefix: 'Finanzas.')]
class FinanzasActividades
{
    /** "Ferretería Sin Crédito" de la semilla (FS2). */
    private const CLIENTE_SIN_CREDITO = '0193a000-0000-7000-8000-0000000c0003';

    /** Cotización de Cochabamba, 20 t de INSUMOS_LIQUIDOS = 6.250 BOB (FS4: la cisterna está en mantenimiento). */
    private const COTIZACION_LIQUIDOS = '0193a000-0000-7000-8000-0000000d0004';

    #[ActivityMethod('validarYReservarCredito')]
    public function validarYReservarCredito(array $entrada): array
    {
        $this->log('Finanzas.validarYReservarCredito', $entrada);
        if ($entrada['clienteId'] === self::CLIENTE_SIN_CREDITO) {
            throw new ApplicationFailure(
                'Crédito insuficiente',
                'CREDITO_INSUFICIENTE',
                true,
                EncodedValues::fromValues([[
                    'codigo' => 'CREDITO_INSUFICIENTE',
                    'mensaje' => 'El disponible es 5000.00 BOB y el servicio cuesta 7600.00 BOB',
                    'datos' => ['disponible' => ['monto' => '5000.00', 'moneda' => 'BOB'], 'monto' => ['monto' => '7600.00', 'moneda' => 'BOB']],
                ]]),
            );
        }

        DB::table('reservas_credito')->insertOrIgnore([
            'id' => (string) Str::uuid7(),
            'servicio_id' => $entrada['servicioId'],
            'cliente_id' => $entrada['clienteId'],
            'estado' => 'RESERVADA',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $reserva = DB::table('reservas_credito')->where('servicio_id', $entrada['servicioId'])->first();

        $resultado = $this->ejemplo('ValidarYReservarCreditoResultado');
        $resultado['reservaCreditoId'] = $reserva->id;
        if ($entrada['cotizacionId'] === self::COTIZACION_LIQUIDOS) {
            $resultado = array_merge($resultado, ['tipoCarga' => 'INSUMOS_LIQUIDOS', 'toneladas' => 20, 'monto' => ['monto' => '6250.00', 'moneda' => 'BOB']]);
        }
        return $resultado;
    }

    #[ActivityMethod('liberarCredito')]
    public function liberarCredito(array $entrada): void
    {
        $this->log('Finanzas.liberarCredito', $entrada);
        DB::table('reservas_credito')->where('servicio_id', $entrada['servicioId'])
            ->update(['estado' => 'LIBERADA', 'motivo_liberacion' => $entrada['motivo'], 'updated_at' => now()]);
    }

    private function ejemplo(string $def): array
    {
        static $contrato = null;
        $contrato ??= json_decode(file_get_contents('/contratos/programar-viaje.schema.json'), true);
        return $contrato['$defs'][$def]['examples'][0];
    }

    private function log(string $actividad, array $entrada): void
    {
        $linea = sprintf('ACTIVIDAD %s pid=%d %s', $actividad, getmypid(), json_encode($entrada, JSON_UNESCAPED_SLASHES));
        Log::info($linea);
        file_put_contents('php://stderr', $linea . PHP_EOL);
    }
}
