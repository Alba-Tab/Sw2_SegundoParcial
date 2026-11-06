<?php

use Symfony\Component\Yaml\Yaml;

// B1: el worker local (.rr.yaml) va sin TLS; el de la nube (.rr.nube.yaml) lo incluye y agrega mTLS desde TEMPORAL_TLS_*.
it('conecta a Temporal sin TLS con .rr.yaml', function () {
    expect(Yaml::parseFile(__DIR__.'/../../.rr.yaml')['temporal'])->not->toHaveKey('tls');
});

it('arma mTLS con .rr.nube.yaml a partir de las variables', function () {
    // Con include, RoadRunner reemplaza cada sección por la del último incluido: .rr.tls.yaml repite temporal entera.
    $local = Yaml::parseFile(__DIR__.'/../../.rr.yaml')['temporal'];
    $tls = Yaml::parseFile(__DIR__.'/../../.rr.tls.yaml')['temporal'];
    expect(Yaml::parseFile(__DIR__.'/../../.rr.nube.yaml'))->toBe(['version' => '3', 'include' => ['.rr.yaml', '.rr.tls.yaml']])
        ->and(array_diff_key($tls, ['tls' => 0]))->toBe($local)
        ->and($tls['tls'])->toBe([
            'key' => '${TEMPORAL_TLS_KEY}',
            'cert' => '${TEMPORAL_TLS_CERT}',
            'root_ca' => '${TEMPORAL_TLS_CA}',
        ]);
});
