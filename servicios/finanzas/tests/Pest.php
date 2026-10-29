<?php

// DatabaseTruncation y no RefreshDatabase: el Outbox debe ver que no hay transacción abierta.

use App\Aplicacion\Catalogo\AplicarCopias;
use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Saga\LiberarPorCancelacion;
use App\Infraestructura\Consola\ConsumirEventos;
use App\Infraestructura\Http\Middleware\Autenticacion;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
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

// Datos de las pruebas de negocio: los mismos ids que la semilla (T4.8) y los ejemplos de los contratos.
const CLIENTE = '01933b5a-1f00-7a20-8b11-0c2d3e4f5a01';
const OTRO_CLIENTE = '01933b5a-1f00-7a20-8b11-0c2d3e4f5a02';
const LA_PAZ = '01933a00-0000-7000-8000-000000000002';
const ARICA = '01933a00-0000-7000-8000-000000000003';
const AULA = '01933a00-0000-7000-8000-000000000004';

function evento(string $tipo, array $datos, ?string $id = null): array
{
    return ['id' => $id ?? (string) Str::uuid7(), 'tipo' => $tipo, 'version' => 1,
        'ocurridoEn' => '2026-11-03T14:05:00Z', 'correlationId' => (string) Str::uuid7(),
        'traceparent' => '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', 'productor' => 'viajes', 'datos' => $datos];
}

function clienteActualizado(string $clienteId, int $version, string $razon = 'Agroexport SRL'): array
{
    return evento('ClienteActualizado', ['clienteId' => $clienteId, 'versionAgregado' => $version, 'razonSocial' => $razon,
        'nit' => '1023456019', 'correo' => 'cobranzas@agroexport.example', 'telefono' => '+59133456789',
        'direccion' => 'Av. Banzer km 7', 'canal' => 'PORTAL', 'tieneCuenta' => true, 'activo' => true]);
}

function rutaActualizada(string $rutaId, string $nombre, int $version, bool $activa = true): array
{
    return evento('RutaActualizada', ['rutaId' => $rutaId, 'versionAgregado' => $version, 'nombre' => $nombre,
        'origen' => ['nombre' => 'Santa Cruz', 'coordenadas' => ['lat' => -17.78, 'lng' => -63.18]],
        'destino' => ['nombre' => $nombre, 'coordenadas' => ['lat' => -16.5, 'lng' => -68.15], 'radioMetros' => 300],
        'distanciaKm' => 850, 'activa' => $activa]);
}

function consumidor(): ConsumirEventos
{
    $c = app(ConsumirEventos::class);
    $c->registrarManejadores(app(AplicarCopias::class), app(LiberarPorCancelacion::class));

    return $c;
}

/**
 * Autenticación de prueba, reloj fijo en $prueba->ahora (2026-11-03 14:00 UTC, se puede mover), el cliente CLIENTE
 * replicado y las rutas La Paz (380/t), Arica (650/t) y Aula (100/t) de granos.
 */
function catalogoDePrueba($prueba): void
{
    autenticacionDePrueba();
    $prueba->ahora = new DateTimeImmutable('2026-11-03T14:00:00Z');
    app()->instance(Reloj::class, new class($prueba) implements Reloj
    {
        public function __construct(private $prueba) {}

        public function ahora(): DateTimeImmutable
        {
            return $this->prueba->ahora;
        }
    });
    $c = consumidor();
    $c->aplicar(clienteActualizado(CLIENTE, 1));
    $c->aplicar(rutaActualizada(LA_PAZ, 'La Paz', 1));
    $c->aplicar(rutaActualizada(ARICA, 'Arica', 1));
    $c->aplicar(rutaActualizada(AULA, 'Aula', 1));
    DB::table('tarifa')->insert([
        ['ruta_id' => LA_PAZ, 'tipo_carga' => 'GRANOS', 'por_tonelada' => '380.00'],
        ['ruta_id' => ARICA, 'tipo_carga' => 'GRANOS', 'por_tonelada' => '650.00'],
        ['ruta_id' => AULA, 'tipo_carga' => 'GRANOS', 'por_tonelada' => '100.00'],
    ]);
}

function cotizar($prueba, string $usuario, array $cuerpo, ?string $clave = null)
{
    return $prueba->withHeaders(['X-Prueba' => $usuario, 'Idempotency-Key' => $clave ?? (string) Str::uuid()])
        ->withToken('prueba')->postJson('/api/v1/cotizaciones', $cuerpo);
}
