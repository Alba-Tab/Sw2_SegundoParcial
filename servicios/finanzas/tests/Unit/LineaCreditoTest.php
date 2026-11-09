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

it('el límite baja hasta lo usado y no menos (LIMITE_MENOR_QUE_USADO con lo usado)', function () {
    $l = LineaCredito::porDefecto('c')->reservar(Monto::bob('7600'))->reservar(Monto::bob('2800'))->consumir(Monto::bob('2800'));
    $justo = $l->ajustarLimite(Monto::bob('10400'));
    expect($justo->limite->aContrato()['monto'])->toBe('10400.00')
        ->and($justo->disponible()->aContrato()['monto'])->toBe('0.00');
    $error = null;
    try {
        $l->ajustarLimite(Monto::bob('10399.99'));
    } catch (ErrorDeDominio $e) {
        $error = $e;
    }
    expect($error?->codigo)->toBe('LIMITE_MENOR_QUE_USADO')
        ->and($error?->datos['usado'])->toBe(['monto' => '10400.00', 'moneda' => 'BOB']);
});

it('suspendida no reserva (CREDITO_RECHAZADO) pero libera, consume y abona; repetir el estado es CONFLICTO_ESTADO', function () {
    $l = LineaCredito::porDefecto('c')->reservar(Monto::bob('1000'))->cambiarEstado(true);
    expect($l->suspendida)->toBeTrue()
        ->and($l->ajustarLimite(Monto::bob('5000'))->suspendida)->toBeTrue()
        ->and($l->consumir(Monto::bob('1000'))->abonar(Monto::bob('1000'))->suspendida)->toBeTrue()
        ->and($l->liberar(Monto::bob('1000'))->reservado->aContrato()['monto'])->toBe('0.00')
        ->and(fn () => $l->cambiarEstado(true))->toThrow(ErrorDeDominio::class, 'ya está suspendida')
        ->and($l->cambiarEstado(false)->reservar(Monto::bob('1'))->reservado->aContrato()['monto'])->toBe('1001.00');
    $error = null;
    try {
        $l->reservar(Monto::bob('1'));
    } catch (ErrorDeDominio $e) {
        $error = $e;
    }
    expect($error?->codigo)->toBe('CREDITO_RECHAZADO')->and($error?->getMessage())->toContain('suspendida');
});
