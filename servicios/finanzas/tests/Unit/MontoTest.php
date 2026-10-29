<?php

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\Uuid7;

it('redondea HALF_UP a 2 decimales y suma sin float', function () {
    expect(Monto::bob('2800')->aContrato())->toBe(['monto' => '2800.00', 'moneda' => 'BOB'])
        ->and(Monto::bob('0.10')->mas(Monto::bob('0.20'))->aContrato()['monto'])->toBe('0.30')
        ->and(Monto::bob('380')->por('20')->aContrato()['monto'])->toBe('7600.00')
        ->and(Monto::bob('25000')->menos(Monto::bob('7600'))->aContrato()['monto'])->toBe('17400.00');
});

it('rechaza negativos, montos inválidos y otra moneda en el value object', function () {
    expect(fn () => Monto::bob('-1'))->toThrow(ErrorDeDominio::class)
        ->and(fn () => Monto::bob('abc'))->toThrow(ErrorDeDominio::class)
        ->and(fn () => Monto::desdeContrato(['monto' => '1.00', 'moneda' => 'USD']))->toThrow(ErrorDeDominio::class)
        ->and(fn () => Monto::bob('100')->menos(Monto::bob('100.01')))->toThrow(ErrorDeDominio::class);
});

it('genera UUIDv7 que ordenan por fecha', function () {
    $a = Uuid7::nuevo();
    usleep(2000);
    $b = Uuid7::nuevo();
    expect($a)->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/')
        ->and(strcmp($a, $b))->toBeLessThan(0);
});
