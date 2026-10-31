<?php

use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Dominio\Credito\LineaCredito;
use App\Infraestructura\Persistencia\LineaCreditoRepositorioDb;
use App\Infraestructura\Temporal\FinanzasActividades;
use Illuminate\Database\LostConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Spec 006 (factura al confirmar la entrega), 007 (liberar por rechazo) y 008 (cobros). */
beforeEach(fn () => catalogoDePrueba($this));

/** Una reserva ACTIVA del Aula (2.800,00) para un servicio nuevo. @return array{servicio: string, cotizacion: string} */
function reservaActiva($prueba): array
{
    $cot = cotizar($prueba, 'sub-c~comercial~', ['clienteId' => CLIENTE, 'rutaId' => AULA, 'tipoCarga' => 'GRANOS', 'toneladas' => 28,
        'fechaViaje' => '2026-11-10'])->json('cotizacionId');
    $servicio = (string) Str::uuid7();
    app(FinanzasActividades::class)->validarYReservarCredito(['servicioId' => $servicio,
        'clienteId' => CLIENTE, 'cotizacionId' => $cot, 'esperaAprobacion' => 'PT3M']);

    return ['servicio' => $servicio, 'cotizacion' => $cot];
}

function entregaConfirmada(string $servicioId, string $viajeId): array
{
    return evento('EntregaConfirmada', ['viajeId' => $viajeId, 'servicioId' => $servicioId, 'clienteId' => CLIENTE,
        'entregaId' => (string) Str::uuid7(), 'entregadoEn' => '2026-11-03T15:00:00Z', 'posicion' => ['lat' => -17.8, 'lng' => -63.2],
        'dentroGeocerca' => true, 'conFirma' => true, 'kmRecorridos' => 120, 'tractoId' => (string) Str::uuid7(),
        'remolqueId' => (string) Str::uuid7(), 'choferId' => (string) Str::uuid7()]);
}

function pagar($prueba, string $facturaId, string $monto, string $referencia, ?string $clave = null, string $usuario = 'sub-a~administracion~')
{
    return $prueba->withHeaders(['X-Prueba' => $usuario, 'Idempotency-Key' => $clave ?? (string) Str::uuid()])->withToken('p')
        ->postJson("/api/v1/facturas/$facturaId/pagos", ['monto' => ['monto' => $monto, 'moneda' => 'BOB'], 'fecha' => '2026-11-03',
            'medio' => 'TRANSFERENCIA', 'referencia' => $referencia]);
}

it('EntregaConfirmada emite una sola factura, consume la reserva y publica FacturaEmitida', function () {
    $r = reservaActiva($this);
    $viaje = (string) Str::uuid7();
    $e = entregaConfirmada($r['servicio'], $viaje);
    expect(consumidor()->aplicar($e))->toBeTrue();
    consumidor()->aplicar(entregaConfirmada($r['servicio'], $viaje));
    expect(DB::table('factura')->where('viaje_id', $viaje)->count())->toBe(1);
    $f = DB::table('factura')->where('viaje_id', $viaje)->first();
    expect($f)->toMatchObject(['monto' => '2800.00', 'saldo' => '2800.00', 'estado' => 'EMITIDA', 'emitida_el' => '2026-11-03',
        'vence_el' => '2026-12-03', 'tipo_carga' => 'GRANOS'])
        ->and($f->numero)->toMatch('/^FAC-\d{6}$/')
        ->and(DB::table('reserva_credito')->value('estado'))->toBe('CONSUMIDA')
        ->and(linea())->toMatchObject(['reservado' => '0.00', 'utilizado' => '2800.00']);
    $sobre = json_decode(DB::table('outbox_eventos')->where('tipo', 'FacturaEmitida')->value('sobre'), true);
    // El sobre sigue la traza y la correlación del evento consumido.
    expect($sobre)->toMatchArray(['traceparent' => $e['traceparent'], 'correlationId' => $e['correlationId']]);
    expect($sobre['datos'])->toMatchArray(['numero' => $f->numero, 'monto' => ['monto' => '2800.00', 'moneda' => 'BOB'],
        'cliente' => ['razonSocial' => 'Agroexport SRL', 'correo' => 'cobranzas@agroexport.example'],
        'enlacePortal' => 'http://localhost:5173/facturas/'.$f->factura_id]);
    expect(DB::table('auditoria')->where('accion', 'EMITIR_FACTURA')->value('canal'))->toBe('SISTEMA');
});

it('EntregaRechazada libera la reserva y la cotización sigue ACEPTADA', function () {
    $r = reservaActiva($this);
    consumidor()->aplicar(evento('EntregaRechazada', ['viajeId' => (string) Str::uuid7(), 'servicioId' => $r['servicio'],
        'clienteId' => CLIENTE, 'entregaId' => (string) Str::uuid7(), 'origenRechazo' => 'RECEPTOR', 'motivo' => 'Carga húmeda',
        'rechazadaEn' => '2026-11-03T15:00:00Z', 'kmRecorridos' => 120, 'tractoId' => (string) Str::uuid7(),
        'remolqueId' => (string) Str::uuid7(), 'choferId' => (string) Str::uuid7()]));
    expect(DB::table('reserva_credito')->first())->toMatchObject(['estado' => 'LIBERADA', 'motivo_liberacion' => 'ENTREGA_RECHAZADA'])
        ->and(linea()->reservado)->toBe('0.00')
        ->and(DB::table('cotizacion')->where('cotizacion_id', $r['cotizacion'])->value('estado'))->toBe('ACEPTADA')
        ->and(DB::table('factura')->count())->toBe(0);
});

it('cobro parcial y total: saldo, estado, línea abonada y PagoRegistrado', function () {
    $r = reservaActiva($this);
    consumidor()->aplicar(entregaConfirmada($r['servicio'], (string) Str::uuid7()));
    $id = DB::table('factura')->value('factura_id');

    $p1 = pagar($this, $id, '1000.00', 'BNB-778811')->assertStatus(201)->assertJsonPath('estado', 'PAGADA_PARCIAL')
        ->assertJsonPath('saldo.monto', '1800.00')->assertJsonCount(1, 'pagos');
    expect($p1->headers->get('Location'))->toStartWith("/api/v1/facturas/$id/pagos/");
    cumpleContrato($p1, '/api/v1/facturas/{facturaId}/pagos', 'post');
    pagar($this, $id, '2000.00', 'BNB-778812')->assertStatus(422)->assertJsonPath('codigo', 'PAGO_EXCEDE_SALDO');
    // FF4: el negativo lo rechaza ya el contrato (patrón de Monto); el cero, el value object. En los dos, el campo es monto.
    pagar($this, $id, '-100.00', 'BNB-778813')->assertStatus(400)->assertJsonPath('errores.0.campo', 'monto');
    pagar($this, $id, '0.00', 'BNB-778813')->assertStatus(400)->assertJsonPath('errores.0.campo', 'monto');
    $dup = pagar($this, $id, '100.00', 'BNB-778811')->assertStatus(409)->assertJsonPath('codigo', 'PAGO_DUPLICADO');
    expect($dup->json('pagoId'))->toBe($p1->json('pagos.0.pagoId'));
    pagar($this, $id, '100.00', 'BNB-1', usuario: 'sub-g~gerente~')->assertStatus(403);

    $clave = (string) Str::uuid();
    $p2 = pagar($this, $id, '1800.00', 'BNB-778814', $clave)->assertStatus(201)->assertJsonPath('estado', 'PAGADA');
    expect(pagar($this, $id, '1800.00', 'BNB-778814', $clave)->json())->toEqual($p2->json()); // jsonb ordena las llaves
    pagar($this, $id, '1.00', 'BNB-778815')->assertStatus(409)->assertJsonPath('codigo', 'CONFLICTO_ESTADO');
    expect(linea()->utilizado)->toBe('0.00')
        ->and(DB::table('pago')->count())->toBe(2)
        ->and(DB::table('outbox_eventos')->where('tipo', 'PagoRegistrado')->count())->toBe(2);
});

it('PagoRegistrado lleva el traceparent y el X-Correlation-Id de la petición', function () {
    consumidor()->aplicar(entregaConfirmada(reservaActiva($this)['servicio'], (string) Str::uuid7()));
    $id = DB::table('factura')->value('factura_id');
    $traza = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    $correlacion = '0193a000-0000-7000-8000-00000000cafe';
    $this->withHeaders(['traceparent' => $traza, 'X-Correlation-Id' => $correlacion]);
    pagar($this, $id, '100.00', 'BNB-700001')->assertStatus(201)->assertHeader('X-Correlation-Id', $correlacion);
    $sobre = json_decode(DB::table('outbox_eventos')->where('tipo', 'PagoRegistrado')->value('sobre'), true);
    expect($sobre)->toMatchArray(['traceparent' => $traza, 'correlationId' => $correlacion]);

    // Sin traceparent (o con uno inválido) se genera uno nuevo por petición.
    $this->withHeaders(['traceparent' => '00-00000000000000000000000000000000-b7ad6b7169203331-01']);
    pagar($this, $id, '100.00', 'BNB-700002')->assertStatus(201);
    $otro = json_decode(DB::table('outbox_eventos')->where('tipo', 'PagoRegistrado')->where('id', '<>', $sobre['id'])->value('sobre'), true);
    expect($otro['traceparent'])->not->toBe($traza)->toMatch('/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/');
});

it('la misma clave y el mismo cuerpo en otra factura no devuelven el pago de la primera', function () {
    consumidor()->aplicar(entregaConfirmada(reservaActiva($this)['servicio'], (string) Str::uuid7()));
    consumidor()->aplicar(entregaConfirmada(reservaActiva($this)['servicio'], (string) Str::uuid7()));
    [$a, $b] = DB::table('factura')->orderBy('numero')->pluck('factura_id')->all();
    $clave = (string) Str::uuid();

    pagar($this, $a, '100.00', 'BNB-500001', $clave)->assertStatus(201)->assertJsonPath('facturaId', $a);
    pagar($this, $b, '100.00', 'BNB-500001', $clave)->assertStatus(422)->assertJsonPath('codigo', 'IDEMPOTENCIA_CUERPO_DISTINTO');
    pagar($this, $a, '100.00', 'BNB-500001', $clave, 'sub-otra~administracion~')->assertStatus(422);
    expect(DB::table('pago')->where('factura_id', $b)->count())->toBe(0)
        ->and(DB::table('factura')->where('factura_id', $b)->value('saldo'))->toBe('2800.00')
        ->and(DB::table('pago')->count())->toBe(1);
});

/** La línea de crédito real, pero `actualizar` pierde la conexión las primeras $fallas veces (falla pasajera). */
function lineaQueSeCae(int $fallas): object
{
    $linea = new class(app(LineaCreditoRepositorioDb::class), $fallas) implements LineaCreditoRepositorio
    {
        public int $intentos = 0;

        public function __construct(private LineaCreditoRepositorioDb $real, public int $fallas) {}

        public function porCliente(string $clienteId): ?LineaCredito
        {
            return $this->real->porCliente($clienteId);
        }

        public function paraActualizar(string $clienteId): ?LineaCredito
        {
            return $this->real->paraActualizar($clienteId);
        }

        public function crear(LineaCredito $linea): void
        {
            $this->real->crear($linea);
        }

        public function actualizar(LineaCredito $linea): void
        {
            if (++$this->intentos <= $this->fallas) {
                throw new LostConnectionException('se cortó la conexión');
            }
            $this->real->actualizar($linea);
        }
    };
    app()->instance(LineaCreditoRepositorio::class, $linea);

    return $linea;
}

it('el resumen de cobranza suma en Finanzas el saldo, las vencidas y las de la ventana', function () {
    $this->artisan('semilla:cargar')->assertSuccessful();
    $hoy = $this->ahora->setTimezone(new DateTimeZone('America/La_Paz'))->format('Y-m-d');
    $hasta = (new DateTimeImmutable($hoy))->modify('+6 days')->format('Y-m-d');
    $conSaldo = DB::table('factura')->where('saldo', '>', 0);
    $saldo = number_format((float) (clone $conSaldo)->sum('saldo'), 2, '.', '');
    $vencidas = (clone $conSaldo)->where('vence_el', '<', $hoy)->count();
    $ventana = (clone $conSaldo)->whereBetween('vence_el', [$hoy, $hasta])->orderBy('vence_el')->orderBy('numero')->pluck('numero');
    expect($vencidas)->toBeGreaterThan(0)->and($ventana)->not->toBeEmpty();

    $url = "/api/v1/facturas/resumen?venceDesde=$hoy&venceHasta=$hasta";
    $r = $this->withHeaders(['X-Prueba' => 'sub-g~gerente~'])->withToken('p')->getJson($url)->assertOk()
        ->assertJsonPath('saldoTotal', ['monto' => $saldo, 'moneda' => 'BOB'])
        ->assertJsonPath('facturasVencidas', $vencidas)
        ->assertJsonPath('facturasPorVencer', $ventana->count());
    expect(array_column($r->json('proximas'), 'numero'))->toBe($ventana->take(5)->all());
    cumpleContrato($r, '/api/v1/facturas/resumen');

    $this->withHeaders(['X-Prueba' => 'sub-d~despachador~'])->withToken('p')->getJson($url)->assertStatus(403);
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')
        ->getJson("/api/v1/facturas/resumen?venceDesde=$hasta&venceHasta=$hoy")->assertStatus(400);
    $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p')
        ->getJson('/api/v1/facturas/resumen')->assertStatus(400);
});

it('el cliente ve solo sus facturas, con mora calculada; administración filtra por saldo y vencimiento', function () {
    $this->artisan('semilla:cargar')->assertSuccessful();
    $moroso = '0193a000-0000-7000-8000-0000000c0002';
    $cliente = $this->withHeaders(['X-Prueba' => 'sub-m~cliente~'.$moroso])->withToken('p');
    $lista = $cliente->getJson('/api/v1/facturas?clienteId='.CLIENTE)->assertOk()->assertJsonCount(1, 'items')
        ->assertJsonPath('items.0.clienteId', $moroso)->assertJsonPath('items.0.vencida', true);
    cumpleContrato($lista, '/api/v1/facturas');
    $ajena = DB::table('factura')->where('cliente_id', '0193a000-0000-7000-8000-0000000c0001')->value('factura_id');
    $cliente->getJson("/api/v1/facturas/$ajena")->assertStatus(403);
    $this->withHeaders(['X-Prueba' => 'sub-c~comercial~'])->withToken('p')->getJson('/api/v1/facturas')->assertStatus(400);
    $hoy = (new DateTimeImmutable('2026-11-03'));
    $adm = $this->withHeaders(['X-Prueba' => 'sub-a~administracion~'])->withToken('p');
    $adm->getJson('/api/v1/facturas?conSaldo=true&limite=2')->assertOk()->assertJsonCount(2, 'items')->assertJsonPath('siguienteCursor', fn ($c) => $c !== null);
    cumpleContrato($adm->getJson('/api/v1/facturas/'.$ajena), '/api/v1/facturas/{facturaId}');
    expect($hoy)->toBeInstanceOf(DateTimeImmutable::class);
});
