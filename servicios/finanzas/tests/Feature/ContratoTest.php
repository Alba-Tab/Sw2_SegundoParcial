<?php

use App\Infraestructura\Http\Middleware\Autenticacion;
use App\Infraestructura\Http\Middleware\ValidarContrato;
use App\Infraestructura\Http\Problemas;
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

    it('un parámetro que no es UTF-8 válido da 400 VALIDACION con el campo, no 500', function () {
        autenticacionDePrueba();
        $adm = $this->withHeaders(['X-Prueba' => 'sub-a~administracion~']);
        $adm->getJson('/api/v1/facturas?venceDesde=%E0%A4%A&estado=%E0%A4%A')->assertStatus(400)
            ->assertJsonPath('codigo', 'VALIDACION')->assertJsonPath('errores.0.campo', 'venceDesde');
        $adm->getJson('/api/v1/cotizaciones?clienteId=%E0%A4%A')->assertStatus(400)->assertJsonPath('errores.0.campo', 'clienteId');
        $adm->getJson('/api/v1/cotizaciones?limite=10&%E0%A4%A=1')->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
        $adm->getJson('/api/v1/lineas-credito/%E0%A4%A')->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    });

    it('deja pasar una petición que cumple el contrato', function () {
        autenticacionDePrueba();
        $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->getJson('/api/v1/cotizaciones?limite=10')->assertOk();
    });
});

it('un detalle con bytes que no son UTF-8 sale con U+FFFD en vez de romper el JSON', function () {
    $r = Problemas::respuesta('VALIDACION', 'Petición inválida', "estado: \xE0\xA4%A no es válido", 400);
    expect($r->getStatusCode())->toBe(400)
        ->and(json_decode((string) $r->getContent(), true)['detail'])->toBe("estado: \u{FFFD}%A no es válido");
});

it('un cuerpo que pasa post_max_size da 413 VALIDACION, con title para personas', function () {
    $this->call('POST', '/api/v1/cotizaciones', [], [], [], ['CONTENT_LENGTH' => (string) (1024 ** 3),
        'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], '{}')
        ->assertStatus(413)->assertHeader('Content-Type', 'application/problem+json')
        ->assertJsonPath('type', 'https://transporte.local/errores/validacion')->assertJsonPath('codigo', 'VALIDACION')
        ->assertJsonPath('title', 'Petición demasiado grande');
});

it('el title de una excepción HTTP es texto para personas, no el código', function () {
    autenticacionDePrueba();
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')->getJson('/api/v1/no-existe')
        ->assertStatus(404)->assertJsonPath('codigo', 'NO_ENCONTRADO')->assertJsonPath('title', 'No encontrado');
});
