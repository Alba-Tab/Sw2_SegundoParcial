<?php

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Mensajeria\RelayOutbox;
use Illuminate\Support\Facades\DB;
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

it('el Outbox solo se escribe dentro de una transacción y se revierte con ella', function () {
    $registro = app(RegistroDeEventos::class);
    expect(fn () => $registro->registrar('PagoRegistrado', 'finanzas.prueba-esqueleto.v1', []))->toThrow(LogicException::class);
    try {
        DB::transaction(function () use ($registro) {
            $registro->registrar('PagoRegistrado', 'finanzas.prueba-esqueleto.v1', ['pagoId' => 'revertido']);
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
    [$cola] = $canal->queue_declare('', false, false, true, true);
    $canal->queue_bind($cola, RelayOutbox::EXCHANGE, 'finanzas.prueba-esqueleto.v1');

    DB::transaction(fn () => app(RegistroDeEventos::class)->registrar('PagoRegistrado', 'finanzas.prueba-esqueleto.v1', ['pagoId' => 'p1']));
    expect(app(RelayOutbox::class)->publicarPendientes())->toBe(1);

    $mensaje = null;
    for ($i = 0; $i < 20 && ! $mensaje; $i++) {
        $mensaje = $canal->basic_get($cola, true) ?: null;
        usleep(100_000);
    }
    expect($mensaje)->not->toBeNull();
    $sobre = json_decode($mensaje->getBody(), true);
    expect($sobre)->toMatchArray(['tipo' => 'PagoRegistrado', 'version' => 1, 'productor' => 'finanzas', 'datos' => ['pagoId' => 'p1']])
        ->and($mensaje->get('message_id'))->toBe($sobre['id'])
        ->and(DB::table('outbox_eventos')->whereNull('publicado_en')->count())->toBe(0);
    $conexion->close();
    app(ConexionAmqp::class)->cerrar();
});
