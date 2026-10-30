<?php

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Infraestructura\Log\FormatoJson;
use App\Infraestructura\Log\Traza;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Mensajeria\RelayOutbox;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;
use Monolog\Level;
use Monolog\LogRecord;
use PhpAmqpLib\Connection\AMQPStreamConnection;

it('salud no depende de Keycloak', function () {
    $this->getJson('/health')->assertOk()->assertExactJson(['estado' => 'UP']);
    $this->getJson('/health/ready')->assertOk()->assertJsonPath('dependencias', ['postgres' => 'UP', 'rabbitmq' => 'UP']);
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
