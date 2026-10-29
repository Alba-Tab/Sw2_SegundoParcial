<?php

use App\Infraestructura\Http\Middleware\Correlacion;
use App\Infraestructura\Http\Problemas;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: '',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withCommands([__DIR__.'/../app/Infraestructura/Consola'])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(Correlacion::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Servicio solo de API: todo error sale como application/problem+json (000 §5).
        $exceptions->render(fn (Throwable $e) => Problemas::desde($e));
    })->create();
