<?php

use App\Aplicacion\Catalogo\AplicarCopias;
use App\Aplicacion\Puertos\Reloj;
use App\Infraestructura\Consola\ConsumirEventos;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Spec 002 (cotizar) y la parte de Finanzas de la spec 001 (copia del cliente y línea por defecto). */
const CLIENTE = '01933b5a-1f00-7a20-8b11-0c2d3e4f5a01';
const OTRO_CLIENTE = '01933b5a-1f00-7a20-8b11-0c2d3e4f5a02';
const LA_PAZ = '01933a00-0000-7000-8000-000000000002';
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
    $c->registrarManejadores(app(AplicarCopias::class));

    return $c;
}

beforeEach(function () {
    autenticacionDePrueba();
    $this->ahora = new DateTimeImmutable('2026-11-03T14:00:00Z');
    $this->app->instance(Reloj::class, new class($this) implements Reloj
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
    $c->aplicar(rutaActualizada(AULA, 'Aula', 1));
    DB::table('tarifa')->insert([
        ['ruta_id' => LA_PAZ, 'tipo_carga' => 'GRANOS', 'por_tonelada' => '380.00'],
        ['ruta_id' => AULA, 'tipo_carga' => 'GRANOS', 'por_tonelada' => '100.00'],
    ]);
});

function cotizar($prueba, string $usuario, array $cuerpo, ?string $clave = null)
{
    return $prueba->withHeaders(['X-Prueba' => $usuario, 'Idempotency-Key' => $clave ?? (string) Str::uuid()])
        ->withToken('prueba')->postJson('/api/v1/cotizaciones', $cuerpo);
}

$laPaz20 = ['rutaId' => LA_PAZ, 'tipoCarga' => 'GRANOS', 'toneladas' => 20, 'fechaViaje' => '2026-11-10'];

it('el primer ClienteActualizado crea la copia y la línea de 30.000 BOB; repetidos y versiones viejas no cambian nada', function () {
    $c = consumidor();
    expect(DB::table('linea_credito')->where('cliente_id', CLIENTE)->value('limite'))->toBe('30000.00');
    $e = clienteActualizado(CLIENTE, 2, 'Agroexport SA');
    expect($c->aplicar($e))->toBeTrue()->and($c->aplicar($e))->toBeFalse();
    $c->aplicar(clienteActualizado(CLIENTE, 1, 'Nombre viejo'));
    expect(DB::table('cliente_copia')->where('cliente_id', CLIENTE)->value('razon_social'))->toBe('Agroexport SA')
        ->and(DB::table('linea_credito')->count())->toBe(1);
});

it('descarta una RutaActualizada con versión menor a la aplicada', function () {
    $c = consumidor();
    $c->aplicar(rutaActualizada(LA_PAZ, 'La Paz v3', 3));
    $c->aplicar(rutaActualizada(LA_PAZ, 'La Paz v2', 2));
    expect(DB::table('ruta_copia')->where('ruta_id', LA_PAZ)->value('nombre'))->toBe('La Paz v3');
});

it('cotiza La Paz con 20 t de granos: 7.600,00 BOB, vigente 24 h', function () use ($laPaz20) {
    $r = cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20)->assertStatus(201);
    $r->assertJsonPath('monto', ['monto' => '7600.00', 'moneda' => 'BOB'])
        ->assertJsonPath('tarifaPorTonelada.monto', '380.00')
        ->assertJsonPath('estado', 'VIGENTE')->assertJsonPath('vencida', false)
        ->assertJsonPath('venceEn', '2026-11-04T14:00:00Z')->assertJsonPath('canal', 'PORTAL')
        ->assertHeader('Location', '/api/v1/cotizaciones/'.$r->json('cotizacionId'));
    cumpleContrato($r, '/api/v1/cotizaciones', 'post');
});

it('rechaza más de 30 t con 422 TONELAJE_EXCEDIDO', function () use ($laPaz20) {
    cotizar($this, 'sub-1~cliente~'.CLIENTE, ['toneladas' => 31] + $laPaz20)->assertStatus(422)->assertJsonPath('codigo', 'TONELAJE_EXCEDIDO');
});

it('con rol cliente ignora el clienteId del cuerpo; comercial lo exige y registra TELEFONO', function () use ($laPaz20) {
    cotizar($this, 'sub-1~cliente~'.CLIENTE, ['clienteId' => OTRO_CLIENTE] + $laPaz20)->assertStatus(201)->assertJsonPath('clienteId', CLIENTE);
    cotizar($this, 'sub-c~comercial~', $laPaz20)->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    cotizar($this, 'sub-c~comercial~', ['clienteId' => CLIENTE] + $laPaz20)->assertStatus(201)->assertJsonPath('canal', 'TELEFONO');
});

it('cliente aún no replicado: 503 CLIENTE_NO_REPLICADO con Retry-After 2', function () use ($laPaz20) {
    cotizar($this, 'sub-2~cliente~'.OTRO_CLIENTE, $laPaz20)->assertStatus(503)
        ->assertJsonPath('codigo', 'CLIENTE_NO_REPLICADO')->assertHeader('Retry-After', '2');
});

it('ruta inexistente 404, sin tarifa 400 y fecha pasada 400', function () use ($laPaz20) {
    $u = 'sub-1~cliente~'.CLIENTE;
    cotizar($this, $u, ['rutaId' => '01933a00-0000-7000-8000-0000000000ff'] + $laPaz20)->assertStatus(404);
    cotizar($this, $u, ['tipoCarga' => 'CONTENEDOR'] + $laPaz20)->assertStatus(400)->assertJsonPath('codigo', 'VALIDACION');
    cotizar($this, $u, ['fechaViaje' => '2026-11-01'] + $laPaz20)->assertStatus(400);
    cotizar($this, $u, ['fechaViaje' => '2027-03-01'] + $laPaz20)->assertStatus(400);
});

it('el reenvío con la misma clave devuelve lo mismo y otro cuerpo da 422', function () use ($laPaz20) {
    $clave = (string) Str::uuid();
    $u = 'sub-1~cliente~'.CLIENTE;
    $a = cotizar($this, $u, $laPaz20, $clave)->assertStatus(201);
    $b = cotizar($this, $u, $laPaz20, $clave)->assertStatus(201);
    expect($b->json('cotizacionId'))->toBe($a->json('cotizacionId'))->and(DB::table('cotizacion')->count())->toBe(1);
    $b->assertHeader('Location', $a->headers->get('Location'));
    cotizar($this, $u, ['toneladas' => 10] + $laPaz20, $clave)->assertStatus(422)->assertJsonPath('codigo', 'IDEMPOTENCIA_CUERPO_DISTINTO');
});

it('con vigencia PT2M la cotización aparece vencida después de 2 minutos', function () {
    config(['servicio.cotizacion_vigencia' => 'PT2M']);
    $r = cotizar($this, 'sub-1~cliente~'.CLIENTE, ['rutaId' => AULA, 'tipoCarga' => 'GRANOS', 'toneladas' => 28, 'fechaViaje' => '2026-11-03'])
        ->assertStatus(201)->assertJsonPath('monto.monto', '2800.00');
    $this->ahora = $this->ahora->modify('+3 minutes');
    $this->withHeaders(['X-Prueba' => 'sub-1~cliente~'.CLIENTE])->withToken('prueba')
        ->getJson('/api/v1/cotizaciones/'.$r->json('cotizacionId'))->assertOk()->assertJsonPath('vencida', true)->assertJsonPath('estado', 'VIGENTE');
});

it('un cliente no ve cotizaciones ajenas; administración ve y lista todas', function () use ($laPaz20) {
    $id = cotizar($this, 'sub-1~cliente~'.CLIENTE, $laPaz20)->json('cotizacionId');
    $ajeno = ['X-Prueba' => 'sub-2~cliente~'.OTRO_CLIENTE];
    $this->withHeaders($ajeno)->withToken('p')->getJson("/api/v1/cotizaciones/$id")->assertStatus(403);
    $this->withHeaders($ajeno)->withToken('p')->getJson('/api/v1/cotizaciones')->assertOk()->assertJsonCount(0, 'items');
    $adm = $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p');
    $adm->getJson("/api/v1/cotizaciones/$id")->assertOk();
    $lista = $adm->getJson('/api/v1/cotizaciones?clienteId='.CLIENTE)->assertOk()->assertJsonCount(1, 'items')->assertJsonPath('siguienteCursor', null);
    cumpleContrato($lista, '/api/v1/cotizaciones');
});

it('línea de crédito propia y de un cliente según el rol', function () {
    $r = $this->withHeaders(['X-Prueba' => 'sub-1~cliente~'.CLIENTE])->withToken('p')->getJson('/api/v1/lineas-credito/mia')->assertOk()
        ->assertJsonPath('disponible.monto', '30000.00')->assertJsonPath('enMora', false);
    cumpleContrato($r, '/api/v1/lineas-credito/mia');
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.CLIENTE)->assertOk();
    $this->withHeaders(['X-Prueba' => 'sub-d~despachador~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.CLIENTE)->assertStatus(403);
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')->getJson('/api/v1/lineas-credito/'.OTRO_CLIENTE)->assertStatus(404);
});
