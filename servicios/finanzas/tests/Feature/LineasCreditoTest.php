<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** G6 y B5 (spec 012): ajuste, suspensión y lectura por lotes de las líneas de crédito. */
beforeEach(fn () => catalogoDePrueba($this));

function ajustar($prueba, string $limite, string $motivo = 'Revisión anual', ?string $clave = null, string $usuario = 'sub-a~administracion~',
    string $clienteId = CLIENTE)
{
    return $prueba->withHeaders(['X-Prueba' => $usuario, 'Idempotency-Key' => $clave ?? (string) Str::uuid()])->withToken('p')
        ->putJson("/api/v1/lineas-credito/$clienteId", ['limite' => ['monto' => $limite, 'moneda' => 'BOB'], 'motivo' => $motivo]);
}

function cambiarEstado($prueba, bool $suspendida, ?string $clave = null, string $usuario = 'sub-a~administracion~', string $motivo = 'Cheque rechazado')
{
    return $prueba->withHeaders(['X-Prueba' => $usuario, 'Idempotency-Key' => $clave ?? (string) Str::uuid()])->withToken('p')
        ->postJson('/api/v1/lineas-credito/'.CLIENTE.'/estado', ['suspendida' => $suspendida, 'motivo' => $motivo]);
}

it('ajusta el límite una sola vez por clave, lo audita y la respuesta cumple el contrato', function () {
    $clave = (string) Str::uuid();
    $r = ajustar($this, '50000.00', clave: $clave)->assertOk()
        ->assertJsonPath('limite.monto', '50000.00')->assertJsonPath('disponible.monto', '50000.00')->assertJsonPath('suspendida', false);
    cumpleContrato($r, '/api/v1/lineas-credito/{clienteId}', 'put');
    ajustar($this, '50000.00', clave: $clave)->assertOk()->assertJson($r->json());
    ajustar($this, '40000.00', clave: $clave)->assertStatus(422)->assertJsonPath('codigo', 'IDEMPOTENCIA_CUERPO_DISTINTO');

    $auditoria = DB::table('auditoria')->where('accion', 'AJUSTAR_LINEA_CREDITO')->get();
    expect($auditoria)->toHaveCount(1)
        ->and($auditoria[0]->entidad_id)->toBe(CLIENTE)
        ->and($auditoria[0]->actor_rol)->toBe('administracion')
        ->and(json_decode($auditoria[0]->datos, true))->toEqual(['limiteAnterior' => ['monto' => '30000.00', 'moneda' => 'BOB'],
            'limite' => ['monto' => '50000.00', 'moneda' => 'BOB'], 'motivo' => 'Revisión anual']);
    ajustar($this, '45000.00', usuario: 'sub-g~gerente~')->assertOk();
});

it('no baja el límite de lo reservado y utilizado: 409 LIMITE_MENOR_QUE_USADO con lo usado', function () {
    DB::table('linea_credito')->where('cliente_id', CLIENTE)->update(['reservado' => '7600.00', 'utilizado' => '2800.00']);
    $r = ajustar($this, '10399.99')->assertStatus(409)->assertJsonPath('codigo', 'LIMITE_MENOR_QUE_USADO')
        ->assertJsonPath('usado', ['monto' => '10400.00', 'moneda' => 'BOB']);
    cumpleContrato($r, '/api/v1/lineas-credito/{clienteId}', 'put');
    expect(DB::table('linea_credito')->where('cliente_id', CLIENTE)->value('limite'))->toBe('30000.00')
        ->and(DB::table('auditoria')->where('entidad', 'LineaCredito')->count())->toBe(0);
    ajustar($this, '10400.00')->assertOk()->assertJsonPath('disponible.monto', '0.00');
});

it('rol, cliente sin línea, motivo y monto inválidos', function () {
    ajustar($this, '1.00', usuario: 'sub-c~comercial~')->assertStatus(403)->assertJsonPath('codigo', 'SIN_PERMISO');
    cambiarEstado($this, true, usuario: 'sub-d~despachador~')->assertStatus(403);
    ajustar($this, '1.00', clienteId: OTRO_CLIENTE)->assertStatus(404)->assertJsonPath('codigo', 'NO_ENCONTRADO');
    ajustar($this, '1.00', motivo: '  a  ')->assertStatus(400)->assertJsonPath('errores.0.campo', 'motivo');
    ajustar($this, '1.5')->assertStatus(400)->assertJsonPath('errores.0.campo', 'limite');
    cambiarEstado($this, true, motivo: 'no')->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
});

it('suspende y reactiva con auditoría; pedir el mismo estado es CONFLICTO_ESTADO', function () {
    $r = cambiarEstado($this, true)->assertOk()->assertJsonPath('suspendida', true);
    cumpleContrato($r, '/api/v1/lineas-credito/{clienteId}/estado', 'post');
    cambiarEstado($this, true)->assertStatus(409)->assertJsonPath('codigo', 'CONFLICTO_ESTADO');
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.CLIENTE)
        ->assertJsonPath('suspendida', true);
    cambiarEstado($this, false, usuario: 'sub-g~gerente~', motivo: 'Regularizó')->assertOk()->assertJsonPath('suspendida', false);
    expect(DB::table('auditoria')->where('entidad', 'LineaCredito')->pluck('accion')->sort()->values()->all())->toBe(['REACTIVAR_LINEA_CREDITO', 'SUSPENDER_LINEA_CREDITO']);
});

it('B5: las líneas de varios clientes en una llamada, con mora y sin los que no tienen línea', function () {
    consumidor()->aplicar(clienteActualizado(OTRO_CLIENTE, 1, 'Agro Moroso'));
    DB::table('factura')->insert(['factura_id' => (string) Str::uuid7(), 'numero' => 'FAC-000001', 'viaje_id' => (string) Str::uuid7(),
        'servicio_id' => (string) Str::uuid7(), 'cliente_id' => OTRO_CLIENTE, 'monto' => '5000.00', 'saldo' => '5000.00',
        'estado' => 'EMITIDA', 'emitida_el' => '2026-09-14', 'vence_el' => '2026-10-14']);
    $sinLinea = '01933b5a-1f00-7a20-8b11-0c2d3e4f5aff';
    $adm = $this->withHeaders(['X-Prueba' => 'sub-a~comercial~'])->withToken('p');
    $r = $adm->getJson('/api/v1/lineas-credito?clienteIds='.implode(',', [CLIENTE, OTRO_CLIENTE, $sinLinea, CLIENTE]))->assertOk();
    cumpleContrato($r, '/api/v1/lineas-credito');
    $porCliente = collect($r->json('items'))->keyBy('clienteId');
    expect($porCliente->keys()->sort()->values()->all())->toBe([CLIENTE, OTRO_CLIENTE])
        ->and($porCliente[CLIENTE]['enMora'])->toBeFalse()
        ->and($porCliente[OTRO_CLIENTE]['enMora'])->toBeTrue();

    $muchos = implode(',', array_map(fn () => (string) Str::uuid7(), range(1, 101)));
    $adm->getJson('/api/v1/lineas-credito?clienteIds='.$muchos)->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    $adm->getJson('/api/v1/lineas-credito?clienteIds=no-es-uuid')->assertStatus(400);
    $adm->getJson('/api/v1/lineas-credito')->assertStatus(400);
    $this->withHeaders(['X-Prueba' => 'sub-d~despachador~'])->withToken('p')->getJson('/api/v1/lineas-credito?clienteIds='.CLIENTE)
        ->assertStatus(403);
});
