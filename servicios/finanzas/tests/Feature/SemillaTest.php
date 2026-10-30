<?php

use App\Aplicacion\Puertos\EvaluadorMora;
use Illuminate\Support\Facades\DB;

/** T4.8 (D102): la semilla compartida deja los datos de los escenarios de la demo, sin eventos y de forma idempotente. */
it('carga clientes, tarifas, facturas y líneas con las fechas relativas a hoy', function () {
    $this->artisan('semilla:cargar')->assertSuccessful();
    $this->artisan('semilla:cargar')->assertSuccessful();

    $linea = fn (string $id) => DB::table('linea_credito')->where('cliente_id', $id)->first();
    expect($linea('0193a000-0000-7000-8000-0000000c0002'))->toMatchObject(['limite' => '30000.00', 'utilizado' => '5000.00'])
        ->and($linea('0193a000-0000-7000-8000-0000000c0003')->limite)->toBe('5000.00')
        ->and($linea('0193a000-0000-7000-8000-0000000c0001')->utilizado)->toBe('10400.00');
    expect(DB::table('tarifa')->count())->toBe(16)
        ->and(DB::table('tarifa')->where(['ruta_id' => '01933a00-0000-7000-8000-000000000001', 'tipo_carga' => 'INSUMOS_LIQUIDOS'])->value('por_tonelada'))->toBe('312.50')
        ->and(DB::table('tarifa')->where(['ruta_id' => '01933a00-0000-7000-8000-000000000003', 'tipo_carga' => 'GRANOS'])->value('por_tonelada'))->toBe('650.00');

    $hoy = new DateTimeImmutable('today', new DateTimeZone('America/La_Paz'));
    expect(DB::table('factura')->where('numero', 'FAC-000001')->value('vence_el'))->toBe($hoy->modify('-20 days')->format('Y-m-d'))
        ->and(DB::table('outbox_eventos')->count())->toBe(0)
        ->and(DB::scalar("SELECT nextval('factura_numero_seq')"))->toBe(4);
    expect(app(EvaluadorMora::class)->enMora('0193a000-0000-7000-8000-0000000c0002', new DateTimeImmutable))->toBeTrue()
        ->and(app(EvaluadorMora::class)->enMora('0193a000-0000-7000-8000-0000000c0001', new DateTimeImmutable))->toBeFalse();
});
