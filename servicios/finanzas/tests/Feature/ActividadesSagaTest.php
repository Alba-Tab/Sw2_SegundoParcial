<?php

use App\Infraestructura\Temporal\FinanzasActividades;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Temporal\Exception\Failure\ApplicationFailure;

/** Actividades Finanzas.* de la saga (spec 003) y el paso 2b (spec 012), llamadas como lo hace el worker. */
beforeEach(fn () => catalogoDePrueba($this));

function actividades(): FinanzasActividades
{
    return app(FinanzasActividades::class);
}

/** Crea la cotización por la API y devuelve su id. */
function cotizacion($prueba, string $rutaId, float $toneladas, string $clienteId = CLIENTE): string
{
    return cotizar($prueba, 'sub-c~comercial~', ['clienteId' => $clienteId, 'rutaId' => $rutaId, 'tipoCarga' => 'GRANOS',
        'toneladas' => $toneladas, 'fechaViaje' => '2026-11-10'])->assertStatus(201)->json('cotizacionId');
}

function reservar(string $servicioId, string $cotizacionId, string $clienteId = CLIENTE): array
{
    return actividades()->validarYReservarCredito(['servicioId' => $servicioId, 'clienteId' => $clienteId,
        'cotizacionId' => $cotizacionId, 'esperaAprobacion' => 'PT3M']);
}

/** Corre la actividad y devuelve el ApplicationFailure que lanzó. */
function falla(Closure $actividad): ApplicationFailure
{
    try {
        $actividad();
    } catch (ApplicationFailure $f) {
        return $f;
    }
    throw new RuntimeException('La actividad no falló');
}

function linea(string $clienteId = CLIENTE): object
{
    return DB::table('linea_credito')->where('cliente_id', $clienteId)->first();
}

function facturaVencida(string $clienteId, string $venceEl, string $saldo = '5000.00'): void
{
    DB::table('factura')->insert(['factura_id' => (string) Str::uuid7(), 'numero' => sprintf('FAC-%06d', random_int(1, 999999)),
        'viaje_id' => (string) Str::uuid7(), 'servicio_id' => (string) Str::uuid7(), 'cliente_id' => $clienteId,
        'monto' => '5000.00', 'saldo' => $saldo, 'estado' => 'EMITIDA', 'emitida_el' => '2026-09-14', 'vence_el' => $venceEl]);
}

it('reserva el monto de la cotización, la acepta y un reintento devuelve lo mismo', function () {
    $cot = cotizacion($this, AULA, 28);
    $servicio = (string) Str::uuid7();
    $r = reservar($servicio, $cot);
    expect($r)->toBe(['resultado' => 'RESERVADO', 'reservaCreditoId' => $r['reservaCreditoId'], 'rutaId' => AULA, 'tipoCarga' => 'GRANOS',
        'toneladas' => 28, 'fechaViaje' => '2026-11-10', 'monto' => ['monto' => '2800.00', 'moneda' => 'BOB']]);
    expect(reservar($servicio, $cot))->toBe($r)
        ->and(linea()->reservado)->toBe('2800.00')
        ->and(linea()->version)->toBe(1)
        ->and(DB::table('cotizacion')->where('cotizacion_id', $cot)->value('estado'))->toBe('ACEPTADA');
});

it('un reintento con otra cotización u otro cliente, o sobre una reserva LIBERADA, es CONFLICTO_ESTADO', function () {
    $cot = cotizacion($this, AULA, 28);
    $otra = cotizacion($this, AULA, 10);
    $servicio = (string) Str::uuid7();
    reservar($servicio, $cot);
    $f = falla(fn () => reservar($servicio, $otra));
    expect($f->getType())->toBe('CONFLICTO_ESTADO')->and($f->isNonRetryable())->toBeTrue()
        ->and(falla(fn () => reservar($servicio, $cot, OTRO_CLIENTE))->getType())->toBe('CONFLICTO_ESTADO');

    actividades()->liberarCredito(['servicioId' => $servicio, 'motivo' => 'CREDITO_RECHAZADO']);
    $f = falla(fn () => reservar($servicio, $cot));
    expect($f->getType())->toBe('CONFLICTO_ESTADO')->and($f->isNonRetryable())->toBeTrue()
        ->and(linea()->reservado)->toBe('0.00');
});

it('un intento simultáneo que reservó mientras se esperaba la cotización devuelve esa reserva', function () {
    // Otro proceso hace de "primer intento": bloquea la cotización, la acepta y reserva; confirma 1 s después.
    $cot = cotizacion($this, AULA, 28);
    $servicio = (string) Str::uuid7();
    $reserva = (string) Str::uuid7();
    $db = config('database.connections.pgsql');
    $codigo = <<<'PHP'
        [$dsn, $u, $p, $cot, $servicio, $reserva, $cliente] = array_slice($argv, 1);
        $pdo = new PDO($dsn, $u, $p, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE cotizacion SET estado = 'ACEPTADA' WHERE cotizacion_id = ?")->execute([$cot]);
        $pdo->prepare("INSERT INTO reserva_credito (reserva_credito_id, servicio_id, cliente_id, cotizacion_id, monto, estado)
            VALUES (?, ?, ?, ?, 2800.00, 'ACTIVA')")->execute([$reserva, $servicio, $cliente, $cot]);
        echo "listo\n";
        usleep(1_000_000);
        $pdo->commit();
        PHP;
    $proceso = proc_open(['php', '-r', $codigo, '--', "pgsql:host={$db['host']};port={$db['port']};dbname={$db['database']}",
        $db['username'], $db['password'], $cot, $servicio, $reserva, CLIENTE], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
    expect(trim((string) fgets($tubos[1])))->toBe('listo');

    $r = reservar($servicio, $cot);
    expect($r['resultado'])->toBe('RESERVADO')->and($r['reservaCreditoId'])->toBe($reserva)
        ->and(DB::table('reserva_credito')->count())->toBe(1)
        ->and(proc_close($proceso))->toBe(0);
});

it('crédito insuficiente no reintenta, trae el detalle y no deja nada a medias', function () {
    DB::table('linea_credito')->where('cliente_id', CLIENTE)->update(['limite' => '5000.00']);
    $cot = cotizacion($this, LA_PAZ, 20);
    $f = falla(fn () => reservar((string) Str::uuid7(), $cot));
    expect($f->getType())->toBe('CREDITO_INSUFICIENTE')->and($f->isNonRetryable())->toBeTrue();
    expect($f->getDetails()->getValue(0, 'array'))->toMatchArray(['codigo' => 'CREDITO_INSUFICIENTE',
        'datos' => ['disponible' => ['monto' => '5000.00', 'moneda' => 'BOB'], 'monto' => ['monto' => '7600.00', 'moneda' => 'BOB']]]);
    expect(DB::table('cotizacion')->where('cotizacion_id', $cot)->value('estado'))->toBe('VIGENTE')
        ->and(DB::table('reserva_credito')->count())->toBe(0)
        ->and(linea()->reservado)->toBe('0.00');
});

it('cotización ajena, inexistente, vencida o ya usada', function () {
    consumidor()->aplicar(clienteActualizado(OTRO_CLIENTE, 1, 'Agro Moroso'));
    $ajena = cotizacion($this, AULA, 10, OTRO_CLIENTE);
    expect(falla(fn () => reservar((string) Str::uuid7(), $ajena))->getType())->toBe('COTIZACION_AJENA')
        ->and(falla(fn () => reservar((string) Str::uuid7(), (string) Str::uuid7()))->getType())->toBe('COTIZACION_AJENA');

    $usada = cotizacion($this, AULA, 10);
    reservar((string) Str::uuid7(), $usada);
    expect(falla(fn () => reservar((string) Str::uuid7(), $usada))->getType())->toBe('COTIZACION_VENCIDA');

    $vieja = cotizacion($this, AULA, 10);
    $this->ahora = $this->ahora->modify('+25 hours');
    $f = falla(fn () => reservar((string) Str::uuid7(), $vieja));
    expect($f->getType())->toBe('COTIZACION_VENCIDA')->and($f->isNonRetryable())->toBeTrue();
});

it('un cliente sin copia todavía es reintentable', function () {
    $f = falla(fn () => reservar((string) Str::uuid7(), (string) Str::uuid7(), '01933b5a-1f00-7a20-8b11-0c2d3e4f5aff'));
    expect($f->getType())->toBe('CLIENTE_NO_REPLICADO')->and($f->isNonRetryable())->toBeFalse();
});

it('con mora queda PENDIENTE_APROBACION, crea la solicitud y administración la ve con sus facturas', function () {
    facturaVencida(CLIENTE, '2026-10-14');
    $servicio = (string) Str::uuid7();
    $r = reservar($servicio, cotizacion($this, LA_PAZ, 20));
    expect($r['resultado'])->toBe('REQUIERE_APROBACION')->and($r['motivosAprobacion'])->toBe(['MORA'])
        ->and(linea()->reservado)->toBe('7600.00')
        ->and(DB::table('reserva_credito')->value('estado'))->toBe('PENDIENTE_APROBACION');

    $adm = $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p');
    $lista = $adm->getJson('/api/v1/solicitudes-aprobacion?estado=PENDIENTE')->assertOk()
        ->assertJsonPath('items.0.servicioId', $servicio)->assertJsonPath('items.0.razonSocial', 'Agroexport SRL')
        ->assertJsonPath('items.0.venceEn', '2026-11-03T14:03:00Z')->assertJsonPath('siguienteCursor', null);
    cumpleContrato($lista, '/api/v1/solicitudes-aprobacion');
    $detalle = $adm->getJson("/api/v1/solicitudes-aprobacion/$servicio")->assertOk()
        ->assertJsonPath('facturasVencidas.0.diasVencida', 20)->assertJsonPath('facturasVencidas.0.saldo.monto', '5000.00');
    cumpleContrato($detalle, '/api/v1/solicitudes-aprobacion/{servicioId}');
    $this->withHeaders(['X-Prueba' => 'sub-g~gerente~'])->withToken('p')->getJson("/api/v1/solicitudes-aprobacion/$servicio")->assertOk();
    $this->withHeaders(['X-Prueba' => 'sub-c~comercial~'])->withToken('p')->getJson('/api/v1/solicitudes-aprobacion')->assertStatus(403);
    $this->withHeaders(['X-Prueba' => 'sub-1~cliente~'.CLIENTE])->withToken('p')->getJson('/api/v1/lineas-credito/mia')
        ->assertJsonPath('enMora', true)->assertJsonPath('disponible.monto', '22400.00');
});

it('una factura vencida hace 7 días o menos no es mora; más de 15.000 es monto alto', function () {
    facturaVencida(CLIENTE, '2026-10-27');
    $r = reservar((string) Str::uuid7(), cotizacion($this, ARICA, 28));
    expect($r['resultado'])->toBe('REQUIERE_APROBACION')->and($r['motivosAprobacion'])->toBe(['MONTO_ALTO'])
        ->and($r['monto']['monto'])->toBe('18200.00');
});

it('aprobada: la reserva pasa a ACTIVA; repetir la decisión no es error y otra decisión sí', function () {
    facturaVencida(CLIENTE, '2026-10-14');
    $servicio = (string) Str::uuid7();
    reservar($servicio, cotizacion($this, LA_PAZ, 20));
    $decidir = fn (string $d) => actividades()->registrarDecisionCredito(['servicioId' => $servicio, 'decision' => $d, 'aprobadoPor' => 'sub-adm']);
    $decidir('APROBADA');
    $decidir('APROBADA');
    expect(DB::table('reserva_credito')->value('estado'))->toBe('ACTIVA')
        ->and(DB::table('solicitud_aprobacion')->value('estado'))->toBe('APROBADA')
        ->and(DB::table('solicitud_aprobacion')->value('decidida_por'))->toBe('sub-adm');
    $f = falla(fn () => $decidir('RECHAZADA'));
    expect($f->getType())->toBe('CONFLICTO_ESTADO')->and($f->isNonRetryable())->toBeTrue();
});

it('rechazada y liberada: el disponible vuelve a 30.000 y la cotización a VIGENTE', function () {
    facturaVencida(CLIENTE, '2026-10-14');
    $servicio = (string) Str::uuid7();
    $cot = cotizacion($this, LA_PAZ, 20);
    reservar($servicio, $cot);
    actividades()->registrarDecisionCredito(['servicioId' => $servicio, 'decision' => 'RECHAZADA', 'aprobadoPor' => 'sub-adm',
        'motivo' => 'Mora de 20 días']);
    actividades()->liberarCredito(['servicioId' => $servicio, 'motivo' => 'CREDITO_RECHAZADO']);
    actividades()->liberarCredito(['servicioId' => $servicio, 'motivo' => 'CREDITO_RECHAZADO']);
    expect(DB::table('reserva_credito')->first())->toMatchObject(['estado' => 'LIBERADA', 'motivo_liberacion' => 'CREDITO_RECHAZADO'])
        ->and(linea()->reservado)->toBe('0.00')
        ->and(linea()->version)->toBe(2)
        ->and(DB::table('cotizacion')->where('cotizacion_id', $cot)->value('estado'))->toBe('VIGENTE')
        ->and(DB::table('solicitud_aprobacion')->value('motivo_decision'))->toBe('Mora de 20 días');
});

it('vencida la registra el sistema con su motivo; liberar sin reserva no hace nada', function () {
    facturaVencida(CLIENTE, '2026-10-14');
    $servicio = (string) Str::uuid7();
    reservar($servicio, cotizacion($this, LA_PAZ, 20));
    actividades()->registrarDecisionCredito(['servicioId' => $servicio, 'decision' => 'VENCIDA', 'aprobadoPor' => 'sistema']);
    expect(DB::table('solicitud_aprobacion')->first())->toMatchObject(['estado' => 'VENCIDA', 'decidida_por' => 'sistema',
        'motivo_decision' => 'Plazo de aprobación vencido']);
    actividades()->liberarCredito(['servicioId' => (string) Str::uuid7(), 'motivo' => 'SIN_UNIDAD_COMPATIBLE']);
    expect(linea()->reservado)->toBe('7600.00');
});

function viajeCancelado(string $servicioId, string $origen, string $motivo): array
{
    return evento('ViajeCancelado', ['servicioId' => $servicioId, 'viajeId' => (string) Str::uuid7(), 'clienteId' => CLIENTE,
        'motivo' => $motivo, 'origen' => $origen, 'estadoAnterior' => 'CONFIRMADO']);
}

it('ViajeCancelado del usuario libera una sola vez y la cotización sigue ACEPTADA (spec 004)', function () {
    $servicio = (string) Str::uuid7();
    $cot = cotizacion($this, AULA, 28);
    reservar($servicio, $cot);
    $e = viajeCancelado($servicio, 'USUARIO', 'CANCELADO_POR_USUARIO');
    expect(consumidor()->aplicar($e))->toBeTrue()->and(consumidor()->aplicar($e))->toBeFalse();
    consumidor()->aplicar(viajeCancelado($servicio, 'SAGA', 'SIN_UNIDAD_COMPATIBLE'));
    expect(DB::table('reserva_credito')->first())->toMatchObject(['estado' => 'LIBERADA', 'motivo_liberacion' => 'CANCELADO_POR_USUARIO'])
        ->and(linea()->reservado)->toBe('0.00')
        ->and(DB::table('cotizacion')->where('cotizacion_id', $cot)->value('estado'))->toBe('ACEPTADA');
});

it('ViajeCancelado de la saga libera una reserva pendiente y devuelve la cotización (spec 011)', function () {
    facturaVencida(CLIENTE, '2026-10-14');
    $servicio = (string) Str::uuid7();
    $cot = cotizacion($this, LA_PAZ, 20);
    reservar($servicio, $cot);
    consumidor()->aplicar(viajeCancelado($servicio, 'SAGA', 'RESUELTO_MANUALMENTE'));
    expect(DB::table('reserva_credito')->value('estado'))->toBe('LIBERADA')
        ->and(linea()->reservado)->toBe('0.00')
        ->and(DB::table('cotizacion')->where('cotizacion_id', $cot)->value('estado'))->toBe('VIGENTE');
});
