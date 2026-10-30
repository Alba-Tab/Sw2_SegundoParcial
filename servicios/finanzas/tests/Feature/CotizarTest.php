<?php

use App\Infraestructura\Http\Idempotencia;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Spec 002 (cotizar) y la parte de Finanzas de la spec 001 (copia del cliente y línea por defecto). */
beforeEach(fn () => catalogoDePrueba($this));

$laPaz20 = ['rutaId' => LA_PAZ, 'tipoCarga' => 'GRANOS', 'toneladas' => 20, 'fechaViaje' => '2026-11-10'];

it('el primer ClienteActualizado crea la copia y la línea de 30.000 BOB; repetidos y versiones viejas no cambian nada', function () {
    $c = consumidor();
    expect(DB::table('linea_credito')->where('cliente_id', CLIENTE)->value('limite'))->toBe('30000.00');
    $e = clienteActualizado(CLIENTE, 2, 'Agroexport SA');
    expect($c->aplicar($e))->toBeTrue()->and($c->aplicar($e))->toBeFalse();
    $c->aplicar(clienteActualizado(CLIENTE, 1, 'Nombre viejo'));
    expect(DB::table('cliente_copia')->where('cliente_id', CLIENTE)->value('razon_social'))->toBe('Agroexport SA')
        ->and(DB::table('linea_credito')->count())->toBe(1);
});

it('descarta una RutaActualizada con versión menor a la aplicada', function () {
    $c = consumidor();
    $c->aplicar(rutaActualizada(LA_PAZ, 'La Paz v3', 3));
    $c->aplicar(rutaActualizada(LA_PAZ, 'La Paz v2', 2));
    expect(DB::table('ruta_copia')->where('ruta_id', LA_PAZ)->value('nombre'))->toBe('La Paz v3');
});

it('cotiza La Paz con 20 t de granos: 7.600,00 BOB, vigente 24 h', function () use ($laPaz20) {
    $r = cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20)->assertStatus(201);
    $r->assertJsonPath('monto', ['monto' => '7600.00', 'moneda' => 'BOB'])
        ->assertJsonPath('tarifaPorTonelada.monto', '380.00')
        ->assertJsonPath('estado', 'VIGENTE')->assertJsonPath('vencida', false)
        ->assertJsonPath('venceEn', '2026-11-04T14:00:00Z')->assertJsonPath('canal', 'PORTAL')
        ->assertHeader('Location', '/api/v1/cotizaciones/'.$r->json('cotizacionId'));
    cumpleContrato($r, '/api/v1/cotizaciones', 'post');
});

it('rechaza más de 30 t con 422 TONELAJE_EXCEDIDO', function () use ($laPaz20) {
    cotizar($this, 'sub-1~cliente~'.CLIENTE, ['toneladas' => 31] + $laPaz20)->assertStatus(422)->assertJsonPath('codigo', 'TONELAJE_EXCEDIDO');
});

it('toneladas: como máximo 2 decimales, sin exponente y el tope de 30 t con escala 2', function () use ($laPaz20) {
    $u = 'sub-1~cliente~'.CLIENTE;
    foreach ([20.125, 30.0004, 1e-7, 1e-9, 0.001] as $t) {
        cotizar($this, $u, ['toneladas' => $t] + $laPaz20)->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION')
            ->assertJsonPath('errores.0.campo', 'toneladas');
    }
    cotizar($this, $u, ['toneladas' => 30.01] + $laPaz20)->assertStatus(422)->assertJsonPath('codigo', 'TONELAJE_EXCEDIDO');
    $r = cotizar($this, $u, ['toneladas' => 20.1] + $laPaz20)->assertStatus(201)
        ->assertJsonPath('toneladas', 20.1)->assertJsonPath('monto.monto', '7638.00');
    cotizar($this, $u, ['toneladas' => 30.0] + $laPaz20)->assertStatus(201)->assertJsonPath('monto.monto', '11400.00');
    expect(DB::table('cotizacion')->where('cotizacion_id', $r->json('cotizacionId'))->first())
        ->toMatchObject(['toneladas' => '20.10', 'monto' => '7638.00']);
});

it('con rol cliente ignora el clienteId del cuerpo; comercial lo exige y registra TELEFONO', function () use ($laPaz20) {
    cotizar($this, 'sub-1~cliente~'.CLIENTE, ['clienteId' => OTRO_CLIENTE] + $laPaz20)->assertStatus(201)->assertJsonPath('clienteId', CLIENTE);
    cotizar($this, 'sub-c~comercial~', $laPaz20)->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    cotizar($this, 'sub-c~comercial~', ['clienteId' => CLIENTE] + $laPaz20)->assertStatus(201)->assertJsonPath('canal', 'TELEFONO');
});

it('cliente aún no replicado: 503 CLIENTE_NO_REPLICADO con Retry-After 2', function () use ($laPaz20) {
    cotizar($this, 'sub-2~cliente~'.OTRO_CLIENTE, $laPaz20)->assertStatus(503)
        ->assertJsonPath('codigo', 'CLIENTE_NO_REPLICADO')->assertHeader('Retry-After', '2');
});

it('ruta inexistente 404, sin tarifa 400 y fecha pasada 400', function () use ($laPaz20) {
    $u = 'sub-1~cliente~'.CLIENTE;
    cotizar($this, $u, ['rutaId' => '01933a00-0000-7000-8000-0000000000ff'] + $laPaz20)->assertStatus(404);
    cotizar($this, $u, ['tipoCarga' => 'CONTENEDOR'] + $laPaz20)->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    cotizar($this, $u, ['fechaViaje' => '2026-11-01'] + $laPaz20)->assertStatus(400);
    cotizar($this, $u, ['fechaViaje' => '2027-03-01'] + $laPaz20)->assertStatus(400);
});

it('el reenvío con la misma clave devuelve lo mismo y otro cuerpo da 422', function () use ($laPaz20) {
    $clave = (string) Str::uuid();
    $u = 'sub-1~cliente~'.CLIENTE;
    $a = cotizar($this, $u, $laPaz20, $clave)->assertStatus(201);
    $b = cotizar($this, $u, $laPaz20, $clave)->assertStatus(201);
    expect($b->json('cotizacionId'))->toBe($a->json('cotizacionId'))->and(DB::table('cotizacion')->count())->toBe(1);
    $b->assertHeader('Location', $a->headers->get('Location'));
    cotizar($this, $u, ['toneladas' => 10] + $laPaz20, $clave)->assertStatus(422)->assertJsonPath('codigo', 'IDEMPOTENCIA_CUERPO_DISTINTO');
});

it('la clave de otro usuario con el mismo cuerpo no devuelve su cotización', function () use ($laPaz20) {
    $clave = (string) Str::uuid();
    $a = cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20, $clave)->assertStatus(201);
    $b = cotizar($this, 'sub-2~cliente~'.OTRO_CLIENTE, $laPaz20, $clave)->assertStatus(422)
        ->assertJsonPath('codigo', 'IDEMPOTENCIA_CUERPO_DISTINTO');
    expect($b->json('cotizacionId'))->toBeNull()->and($b->getContent())->not->toContain($a->json('cotizacionId'));
});

it('un reenvío simultáneo espera a la primera petición y recibe su respuesta guardada', function () use ($laPaz20) {
    // Otro proceso hace de "primera petición": registra la clave EN_PROCESO y la completa 1 s después.
    $clave = (string) Str::uuid();
    $huella = Idempotencia::huella('POST', '/api/v1/cotizaciones', 'sub-1', $laPaz20);
    $guardada = ['cotizacionId' => '01933b5a-1f00-7a20-8b11-0c2d3e4f5aff', 'estado' => 'VIGENTE'];
    $db = config('database.connections.pgsql');
    $codigo = <<<'PHP'
        [$dsn, $u, $p, $clave, $huella, $cuerpo] = array_slice($argv, 1);
        $pdo = new PDO($dsn, $u, $p, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->beginTransaction();
        $pdo->prepare("INSERT INTO operacion_idempotente (clave, tipo_operacion, hash_cuerpo, estado) VALUES (?, 'CREAR_COTIZACION', ?, 'EN_PROCESO')")
            ->execute([$clave, $huella]);
        echo "listo\n";
        usleep(1_000_000);
        $pdo->prepare("UPDATE operacion_idempotente SET estado = 'COMPLETADA', codigo_http = 201, cuerpo_respuesta = ? WHERE clave = ?")
            ->execute([$cuerpo, $clave]);
        $pdo->commit();
        PHP;
    $proceso = proc_open(['php', '-r', $codigo, '--', "pgsql:host={$db['host']};port={$db['port']};dbname={$db['database']}",
        $db['username'], $db['password'], $clave, $huella, json_encode($guardada)], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
    expect(trim((string) fgets($tubos[1])))->toBe('listo');

    $inicio = microtime(true);
    $r = cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20, $clave)->assertStatus(201);
    expect($r->json())->toEqual($guardada)
        ->and(microtime(true) - $inicio)->toBeGreaterThan(0.5)
        ->and(DB::table('cotizacion')->count())->toBe(0)
        ->and(proc_close($proceso))->toBe(0);
});

it('una clave que quedó EN_PROCESO responde 409 IDEMPOTENCIA_EN_PROCESO', function () use ($laPaz20) {
    $clave = (string) Str::uuid();
    DB::table('operacion_idempotente')->insert(['clave' => $clave, 'tipo_operacion' => 'CREAR_COTIZACION',
        'hash_cuerpo' => Idempotencia::huella('POST', '/api/v1/cotizaciones', 'sub-1', $laPaz20), 'estado' => 'EN_PROCESO']);
    cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20, $clave)->assertStatus(409)->assertJsonPath('codigo', 'IDEMPOTENCIA_EN_PROCESO');
});

it('con vigencia PT2M la cotización aparece vencida después de 2 minutos', function () {
    config(['servicio.cotizacion_vigencia' => 'PT2M']);
    $r = cotizar($this, 'sub-1~cliente~'.CLIENTE, ['rutaId' => AULA, 'tipoCarga' => 'GRANOS', 'toneladas' => 28, 'fechaViaje' => '2026-11-03'])
        ->assertStatus(201)->assertJsonPath('monto.monto', '2800.00');
    $this->ahora = $this->ahora->modify('+3 minutes');
    $this->withHeaders(['X-Prueba' => 'sub-1~cliente~'.CLIENTE])->withToken('prueba')
        ->getJson('/api/v1/cotizaciones/'.$r->json('cotizacionId'))->assertOk()->assertJsonPath('vencida', true)->assertJsonPath('estado', 'VIGENTE');
});

it('un cliente no ve cotizaciones ajenas; administración ve y lista todas', function () use ($laPaz20) {
    $id = cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20)->json('cotizacionId');
    $ajeno = ['X-Prueba' => 'sub-2~cliente~'.OTRO_CLIENTE];
    $this->withHeaders($ajeno)->withToken('p')->getJson("/api/v1/cotizaciones/$id")->assertStatus(403);
    $this->withHeaders($ajeno)->withToken('p')->getJson('/api/v1/cotizaciones')->assertOk()->assertJsonCount(0, 'items');
    $adm = $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p');
    $adm->getJson("/api/v1/cotizaciones/$id")->assertOk();
    $lista = $adm->getJson('/api/v1/cotizaciones?clienteId='.CLIENTE)->assertOk()->assertJsonCount(1, 'items')->assertJsonPath('siguienteCursor', null);
    cumpleContrato($lista, '/api/v1/cotizaciones');
});

it('línea de crédito propia y de un cliente según el rol', function () {
    $r = $this->withHeaders(['X-Prueba' => 'sub-1~cliente~'.CLIENTE])->withToken('p')->getJson('/api/v1/lineas-credito/mia')->assertOk()
        ->assertJsonPath('disponible.monto', '30000.00')->assertJsonPath('enMora', false);
    cumpleContrato($r, '/api/v1/lineas-credito/mia');
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.CLIENTE)->assertOk();
    $this->withHeaders(['X-Prueba' => 'sub-d~despachador~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.CLIENTE)->assertStatus(403);
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.OTRO_CLIENTE)->assertStatus(404);
});
