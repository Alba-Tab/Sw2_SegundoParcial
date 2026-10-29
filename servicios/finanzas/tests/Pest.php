<?php

// DatabaseTruncation y no RefreshDatabase: el Outbox debe ver que no hay transacción abierta.

use App\Infraestructura\Http\Middleware\Autenticacion;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

pest()->extend(TestCase::class)->use(DatabaseTruncation::class)->in('Feature');

/**
 * Reemplaza la validación de JWT (ya probada en EsqueletoTest) por el encabezado X-Prueba con el formato
 * sub~rol1+rol2~clienteId. El validador del contrato igual exige el bearer: las pruebas mandan withToken().
 */
function autenticacionDePrueba(): void
{
    app()->instance(Autenticacion::class, new class
    {
        public function handle($req, $siguiente)
        {
            [$sub, $roles, $cliente] = explode('~', (string) $req->header('X-Prueba').'~~');
            $req->attributes->set('usuario', ['sub' => $sub, 'roles' => $roles === '' ? [] : explode('+', $roles), 'clienteId' => $cliente ?: null]);

            return $siguiente($req);
        }
    });
}
