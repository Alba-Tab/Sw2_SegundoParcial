<?php

use App\Infraestructura\Http\Middleware\Autenticacion;
use App\Infraestructura\Http\SaludController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [SaludController::class, 'vivo']);
Route::get('/health/ready', [SaludController::class, 'listo']);

// Las rutas de negocio (contratos/openapi/finanzas.yaml) entran aquí en F4 y F5.
Route::prefix('api')->middleware(Autenticacion::class)->group(function () {
    // Una ruta inexistente bajo /api pasa primero por la autenticación: 401/503 antes que 404, como en Viajes y Flota.
    Route::any('{ruta}', fn () => abort(404, 'El recurso no existe'))->where('ruta', '.*');
});
