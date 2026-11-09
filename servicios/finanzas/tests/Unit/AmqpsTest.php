<?php

use App\Infraestructura\Mensajeria\ConexionAmqp;

// B2: con AMQP_CA la conexión va por TLS y verifica certificado y nombre contra la CA propia; sin ella, en claro.
$base = ['host' => 'mq.transporte.example', 'puerto' => 5671, 'usuario' => 'finanzas', 'clave' => 'x', 'ca' => ''];

it('sin AMQP_CA no arma TLS', function () use ($base) {
    expect(ConexionAmqp::configuracionTls($base))->toBeNull();
});

it('con AMQP_CA arma TLS verificado contra la CA propia', function () use ($base) {
    $config = ConexionAmqp::configuracionTls([...$base, 'ca' => '/secretos/ca.pem']);
    expect($config->isSecure())->toBeTrue()
        ->and($config->getSslCaCert())->toBe('/secretos/ca.pem')
        ->and($config->getSslVerify())->toBeTrue()
        ->and($config->getSslVerifyName())->toBeTrue()
        ->and([$config->getHost(), $config->getPort(), $config->getHeartbeat()])->toBe(['mq.transporte.example', 5671, 15]);
});
