<?php

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Infraestructura\Http\Middleware\Autenticacion;
use App\Infraestructura\Http\Problemas;
use App\Infraestructura\Log\FormatoJson;
use App\Infraestructura\Log\Traza;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Mensajeria\RelayOutbox;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Monolog\Level;
use Monolog\LogRecord;
use PhpAmqpLib\Connection\AMQPStreamConnection;

it('salud no depende de Keycloak', function () {
    $temporal = temporalDePrueba();
    $this->getJson('/health')->assertOk()->assertExactJson(['estado' => 'UP']);
    $this->getJson('/health/ready')->assertOk()->assertJsonPath('dependencias', ['postgres' => 'UP', 'temporal' => 'UP', 'rabbitmq' => 'UP']);
    fclose($temporal);
});

it('salud lista revisa Temporal: sin él responde 503 con temporal DOWN', function () {
    config(['servicio.temporal' => '127.0.0.1:1']);
    $this->getJson('/health/ready')->assertStatus(503)->assertJsonPath('estado', 'DOWN')
        ->assertJsonPath('dependencias.temporal', 'DOWN')->assertJsonPath('dependencias.postgres', 'UP');
    config(['servicio.temporal' => '']);
    $this->getJson('/health/ready')->assertStatus(503)->assertJsonPath('dependencias.temporal', 'DOWN');
});

it('sin OIDC_ISSUER el negocio responde 503 con Problem Details y la correlación', function () {
    $correlacion = '0193a000-0000-7000-8000-00000000abcd';
    $this->getJson('/api/v1/lineas-credito', ['X-Correlation-Id' => $correlacion])
        ->assertStatus(503)
        ->assertHeader('Content-Type', 'application/problem+json')
        ->assertHeader('Retry-After', '30')
        ->assertHeader('X-Correlation-Id', $correlacion)
        ->assertJson(['codigo' => 'DEPENDENCIA_NO_DISPONIBLE', 'correlationId' => $correlacion]);
});

it('con OIDC_ISSUER y sin token responde 401 NO_AUTENTICADO', function () {
    config(['servicio.oidc_issuer' => 'http://localhost:1/realms/transporte']);
    $this->getJson('/api/v1/lineas-credito')->assertStatus(401)->assertJson(['codigo' => 'NO_AUTENTICADO']);
});

describe('llaves de Keycloak', function () {
    beforeEach(function () {
        Autenticacion::reiniciar();
        $this->issuer = 'http://keycloak.prueba/realms/transporte';
        config(['servicio.oidc_issuer' => $this->issuer]);
        $this->privada = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $rsa = openssl_pkey_get_details($this->privada)['rsa'];
        $b64 = fn (string $v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $this->jwks = ['keys' => [['kty' => 'RSA', 'kid' => 'llave-1', 'use' => 'sig', 'alg' => 'RS256', 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e'])]]];
        $this->token = fn (string $kid) => JWT::encode(['iss' => $this->issuer, 'aud' => ['finanzas'], 'sub' => 'sub-1',
            'exp' => time() + 300, 'realm_access' => ['roles' => ['administracion']]], $this->privada, 'RS256', $kid);
    });
    afterEach(fn () => Autenticacion::reiniciar());

    it('si Keycloak no responde, 503 DEPENDENCIA_NO_DISPONIBLE (no 401) y no lo vuelve a pedir enseguida', function () {
        Http::fake(['*' => Http::response('caído', 500)]);
        $token = ($this->token)('llave-1');
        $this->withToken($token)->getJson('/api/v1/solicitudes-aprobacion')
            ->assertStatus(503)->assertHeader('Retry-After', '10')->assertJsonPath('codigo', 'DEPENDENCIA_NO_DISPONIBLE');
        $this->withToken($token)->getJson('/api/v1/solicitudes-aprobacion')->assertStatus(503);
        Http::assertSentCount(1);
    });

    it('valida el token con las llaves bajadas; un kid desconocido da 401 y no baja las llaves en cada petición', function () {
        Http::fake(['*/protocol/openid-connect/certs' => Http::response($this->jwks)]);
        $this->withToken(($this->token)('llave-1'))->getJson('/api/v1/solicitudes-aprobacion')->assertOk();
        $intruso = ($this->token)('kid-inventado');
        $this->withToken($intruso)->getJson('/api/v1/solicitudes-aprobacion')->assertStatus(401);
        $this->withToken($intruso)->getJson('/api/v1/solicitudes-aprobacion')->assertStatus(401);
        $this->withToken('no.es.jwt')->getJson('/api/v1/solicitudes-aprobacion')->assertStatus(401);
        Http::assertSentCount(2);
    });
});

/** Un PagoRegistrado válido según contratos/eventos (el Outbox valida cada sobre). */
function pagoDePrueba(string $pagoId): array
{
    return ['pagoId' => $pagoId, 'facturaId' => '01933f00-0000-7000-8000-000000000001', 'numeroFactura' => 'FAC-000001',
        'clienteId' => '0193a000-0000-7000-8000-0000000c0002', 'monto' => ['monto' => '100.00', 'moneda' => 'BOB'],
        'fecha' => '2026-11-03', 'medio' => 'TRANSFERENCIA', 'referencia' => 'BNB-1', 'saldoFactura' => ['monto' => '4900.00', 'moneda' => 'BOB'],
        'estadoFactura' => 'PAGADA_PARCIAL'];
}

it('el Outbox valida cada evento contra su contrato', function () {
    expect(fn () => DB::transaction(fn () => app(RegistroDeEventos::class)->registrar('PagoRegistrado', 'finanzas.pago-registrado.v1',
        ['pagoId' => 'no-es-uuid'])))->toThrow(LogicException::class, 'no cumple su contrato');
    DB::transaction(fn () => app(RegistroDeEventos::class)->registrar('PagoRegistrado', 'finanzas.pago-registrado.v1',
        pagoDePrueba('01933f10-0000-7000-8000-000000000001')));
    $sobre = json_decode(DB::table('outbox_eventos')->value('sobre'), true);
    expect($sobre['correlationId'])->toMatch('/^[0-9a-f-]{36}$/')->and($sobre['traceparent'])->toMatch('/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/');
});

it('el Outbox solo se escribe dentro de una transacción y se revierte con ella', function () {
    $registro = app(RegistroDeEventos::class);
    expect(fn () => $registro->registrar('PagoRegistrado', 'finanzas.prueba-esqueleto.v1', []))->toThrow(LogicException::class);
    try {
        DB::transaction(function () use ($registro) {
            $registro->registrar('PagoRegistrado', 'finanzas.prueba-esqueleto.v1', pagoDePrueba('01933f10-0000-7000-8000-000000000002'));
            throw new RuntimeException('falla después de registrar');
        });
    } catch (RuntimeException) {
    }
    expect(DB::table('outbox_eventos')->count())->toBe(0);
});

it('el relay publica el sobre con confirmación y marca publicado_en', function () {
    // La cola temporal de la prueba se crea con el administrador: el usuario finanzas solo puede usar su propia cola.
    $c = config('servicio.amqp');
    $conexion = new AMQPStreamConnection($c['host'], $c['puerto'], env('RABBITMQ_ADMIN', 'admin'), env('RABBITMQ_ADMIN_CLAVE', 'admin'));
    $canal = $conexion->channel();
    // Igual que plataforma/compose/rabbitmq/definitions.json; en CI RabbitMQ arranca sin la topología.
    $canal->exchange_declare(RelayOutbox::EXCHANGE, 'topic', false, true, false);
    [$cola] = $canal->queue_declare('', false, false, true, true);
    $canal->queue_bind($cola, RelayOutbox::EXCHANGE, 'finanzas.prueba-esqueleto.v1');

    DB::transaction(fn () => app(RegistroDeEventos::class)->registrar('PagoRegistrado', 'finanzas.prueba-esqueleto.v1',
        pagoDePrueba('01933f10-0000-7000-8000-000000000003')));
    expect(app(RelayOutbox::class)->publicarPendientes())->toBe(1);

    $mensaje = null;
    for ($i = 0; $i < 20 && ! $mensaje; $i++) {
        $mensaje = $canal->basic_get($cola, true) ?: null;
        usleep(100_000);
    }
    expect($mensaje)->not->toBeNull();
    $sobre = json_decode($mensaje->getBody(), true);
    expect($sobre)->toMatchArray(['tipo' => 'PagoRegistrado', 'version' => 1, 'productor' => 'finanzas', 'datos' => pagoDePrueba('01933f10-0000-7000-8000-000000000003')])
        ->and($mensaje->get('message_id'))->toBe($sobre['id'])
        ->and(DB::table('outbox_eventos')->whereNull('publicado_en')->count())->toBe(0);
    $conexion->close();
    app(ConexionAmqp::class)->cerrar();
});

it('con PostgreSQL caído el negocio responde 503 DEPENDENCIA_NO_DISPONIBLE con Retry-After', function () {
    autenticacionDePrueba();
    config(['database.connections.pgsql.host' => '127.0.0.1', 'database.connections.pgsql.port' => 1]);
    DB::purge('pgsql');
    $this->withHeaders(['X-Prueba' => 'sub-1~cliente~01933b5a-1f00-7a20-8b11-0c2d3e4f5a01'])->withToken('p')
        ->getJson('/api/v1/lineas-credito/mia')
        ->assertStatus(503)->assertHeader('Retry-After', '5')->assertJson(['codigo' => 'DEPENDENCIA_NO_DISPONIBLE']);
});

it('los logs llevan el traceId del traceparent en curso', function () {
    Traza::iniciar('0193a000-0000-7000-8000-00000000abcd', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    $registro = new LogRecord(new DateTimeImmutable, 'finanzas', Level::Info, 'hola', [], Context::all());
    expect(json_decode((new FormatoJson)->format($registro), true))->toMatchArray([
        'correlationId' => '0193a000-0000-7000-8000-00000000abcd', 'traceId' => '4bf92f3577b34da6a3ce929d0e0e4736']);
});

it('un error inesperado es 500 ERROR_INTERNO (000 §5), sin el mensaje interno', function () {
    $r = Problemas::desde(new LogicException('columna rota en lineas_credito'));
    $cuerpo = $r->getData(true);
    expect($r->getStatusCode())->toBe(500)
        ->and($cuerpo['codigo'])->toBe('ERROR_INTERNO')
        ->and($cuerpo['title'])->toBe('Error interno')
        ->and(json_encode($cuerpo))->not->toContain('columna');
});
