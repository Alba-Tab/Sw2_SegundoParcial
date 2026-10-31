<?php

use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Credito\LineaCredito;

it('reserva, libera y consume dentro de lo reservado', function () {
    $l = LineaCredito::porDefecto('c')->reservar(Monto::bob('2800'));
    expect($l->liberar(Monto::bob('2800'))->reservado->aContrato()['monto'])->toBe('0.00');
    $consumida = $l->consumir(Monto::bob('2800'));
    expect($consumida->reservado->aContrato()['monto'])->toBe('0.00')
        ->and($consumida->utilizado->aContrato()['monto'])->toBe('2800.00');
});

it('liberar o consumir más de lo reservado rompe la invariante en vez de dejar reservado en 0', function () {
    $l = LineaCredito::porDefecto('c')->reservar(Monto::bob('1000'));
    expect(fn () => $l->liberar(Monto::bob('1000.01')))->toThrow(ErrorDeDominio::class, 'solo tiene 1000.00 BOB reservados')
        ->and(fn () => $l->consumir(Monto::bob('2800')))->toThrow(ErrorDeDominio::class, 'solo tiene 1000.00 BOB reservados');
    try {
        $l->consumir(Monto::bob('2800'));
    } catch (ErrorDeDominio $e) {
        expect($e->codigo)->toBe('CONFLICTO_ESTADO');
    }
});
