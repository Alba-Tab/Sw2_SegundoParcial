<?php

use App\Infraestructura\Http\Middleware\Autenticacion;
use App\Infraestructura\Http\Middleware\ValidarContrato;
use Illuminate\Testing\TestResponse;
use League\OpenAPIValidation\PSR7\OperationAddress;
use League\OpenAPIValidation\PSR7\ValidatorBuilder;
use Nyholm\Psr7\Factory\Psr17Factory;
use Symfony\Bridge\PsrHttpMessage\Factory\PsrHttpFactory;

/** La respuesta real cumple contratos/openapi/finanzas.yaml (prueba de contrato). */
function cumpleContrato(TestResponse $r, string $ruta, string $metodo = 'get'): void
{
    $f = new Psr17Factory;
    $psr = (new PsrHttpFactory($f, $f, $f, $f))->createResponse($r->baseResponse);
    (new ValidatorBuilder)->fromYamlFile(ValidarContrato::contrato())->getResponseValidator()
        ->validate(new OperationAddress($ruta, $metodo), $psr);
    expect(true)->toBeTrue();
}

it('las respuestas de salud cumplen el contrato', function () {
    $temporal = temporalDePrueba();
    cumpleContrato($this->getJson('/health'), '/health');
    cumpleContrato($this->getJson('/health/ready')->assertOk(), '/health/ready');
    fclose($temporal);
});

describe('validación de peticiones contra el contrato', function () {
    // Sin el middleware de Keycloak; el validador igual exige el encabezado bearer del contrato.
    beforeEach(fn () => $this->withoutMiddleware(Autenticacion::class)->withToken('token-de-prueba'));

    it('rechaza un límite fuera de rango con 400 VALIDACION y el campo', function () {
        $this->getJson('/api/v1/cotizaciones?limite=500')
            ->assertStatus(400)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('codigo', 'VALIDACION')
            ->assertJsonPath('errores.0.campo', 'limite');
    });

    it('rechaza un clienteId que no es UUID en la ruta', function () {
        $this->getJson('/api/v1/lineas-credito/no-es-uuid')->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    });

    it('deja pasar una petición que cumple el contrato', function () {
        autenticacionDePrueba();
        $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->getJson('/api/v1/cotizaciones?limite=10')->assertOk();
    });
});
