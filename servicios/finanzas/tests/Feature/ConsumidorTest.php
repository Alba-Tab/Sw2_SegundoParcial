<?php

use App\Aplicacion\Puertos\VersionDesactualizada;
use App\Infraestructura\Persistencia\FallaTransitoria;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PhpAmqpLib\Message\AMQPMessage;

/** eventos:consumir: qué hace con cada mensaje (ack, vuelta a la cola o DLQ) y el Context de cada uno. */
beforeEach(fn () => catalogoDePrueba($this));

/** Un mensaje de RabbitMQ con un canal falso que anota la respuesta: ack, nack(requeue) o reject(requeue). */
function mensaje(array|string $sobre): AMQPMessage
{
    $m = new AMQPMessage(is_string($sobre) ? $sobre : json_encode($sobre));
    $m->setChannel(new class
    {
        public ?string $respuesta = null;

        public function basic_ack($tag, $multiple = false): void
        {
            $this->respuesta = 'ack';
        }

        public function basic_nack($tag, $multiple = false, $requeue = false): void
        {
            $this->respuesta = $requeue ? 'nack-requeue' : 'nack';
        }

        public function basic_reject($tag, $requeue): void
        {
            $this->respuesta = $requeue ? 'reject-requeue' : 'dlq';
        }
    });
    $m->setDeliveryInfo(1, false, 'transporte.events', 'x');

    return $m;
}

function respuesta(AMQPMessage $m): ?string
{
    return $m->getChannel()->respuesta;
}

function procesar(AMQPMessage $m): string
{
    $c = consumidor();
    $c->esperaReintento = 0;
    $c->procesar($m);

    return respuesta($m);
}

it('aplica el evento y responde ack; uno repetido también', function () {
    $e = clienteActualizado(CLIENTE, 5, 'Agroexport Nueva');
    expect(procesar(mensaje($e)))->toBe('ack')->and(procesar(mensaje($e)))->toBe('ack')
        ->and(DB::table('cliente_copia')->where('cliente_id', CLIENTE)->value('razon_social'))->toBe('Agroexport Nueva');
});

it('manda a la DLQ lo que no tiene manejador, lo mal formado y las reglas de negocio', function () {
    expect(procesar(mensaje('no es json')))->toBe('dlq')
        ->and(procesar(mensaje(['tipo' => ['no', 'texto']])))->toBe('dlq')
        ->and(procesar(mensaje(evento('ViajeIniciado', []))))->toBe('dlq')
        // Sin reserva para el servicio: CONFLICTO_ESTADO (spec 006).
        ->and(procesar(mensaje(evento('EntregaConfirmada', ['viajeId' => (string) Str::uuid7(), 'servicioId' => (string) Str::uuid7()]))))->toBe('dlq')
        // Datos incompletos (TypeError o ErrorException) y un id que no es UUID (error de la base, determinista).
        ->and(procesar(mensaje(evento('ViajeCancelado', ['servicioId' => (string) Str::uuid7()]))))->toBe('dlq')
        ->and(procesar(mensaje(['id' => 'no-es-uuid'] + clienteActualizado(CLIENTE, 9))))->toBe('dlq');
    expect(DB::table('inbox_eventos')->where('tipo', '<>', 'ClienteActualizado')->where('tipo', '<>', 'RutaActualizada')->count())->toBe(0);
});

it('una falla pasajera (VersionDesactualizada) vuelve a la cola sin dejar el evento en el Inbox', function () {
    $r = reservaActiva($this);
    lineaQueChoca(99);
    $e = evento('EntregaRechazada', ['viajeId' => (string) Str::uuid7(), 'servicioId' => $r['servicio'],
        'clienteId' => CLIENTE, 'entregaId' => (string) Str::uuid7(), 'origenRechazo' => 'RECEPTOR', 'motivo' => 'Carga húmeda',
        'rechazadaEn' => '2026-11-03T15:00:00Z', 'kmRecorridos' => 120, 'tractoId' => (string) Str::uuid7(),
        'remolqueId' => (string) Str::uuid7(), 'choferId' => (string) Str::uuid7()]);
    expect(procesar(mensaje($e)))->toBe('nack-requeue')
        ->and(DB::table('inbox_eventos')->where('event_id', $e['id'])->exists())->toBeFalse()
        ->and(DB::table('reserva_credito')->value('estado'))->toBe('ACTIVA');
});

it('clasifica como pasajeros la base caída, los interbloqueos y VersionDesactualizada; lo demás no', function () {
    $sql = fn (string $estado, string $mensaje = 'error') => new QueryException('pgsql', 'select 1', [],
        tap(new PDOException("SQLSTATE[$estado]: $mensaje"), fn ($p) => $p->errorInfo = [$estado, 7, $mensaje]));
    expect(FallaTransitoria::es($sql('08006', 'connection to server failed')))->toBeTrue()
        ->and(FallaTransitoria::es($sql('40P01', 'deadlock detected')))->toBeTrue()
        ->and(FallaTransitoria::es($sql('57P01', 'terminating connection due to administrator command')))->toBeTrue()
        ->and(FallaTransitoria::es(new RuntimeException('envuelta', 0, new VersionDesactualizada('x'))))->toBeTrue()
        ->and(FallaTransitoria::es($sql('23505', 'duplicate key')))->toBeFalse()
        ->and(FallaTransitoria::es($sql('22P02', 'invalid input syntax for type uuid')))->toBeFalse()
        ->and(FallaTransitoria::es(new LogicException('no cumple su contrato')))->toBeFalse();
});

it('cada mensaje reemplaza el Context: correlationId y traceparent del sobre, o nuevos si no traen', function () {
    $e = clienteActualizado(CLIENTE, 7);
    consumidor()->aplicar($e);
    expect(Context::get('correlationId'))->toBe($e['correlationId'])->and(Context::get('traceparent'))->toBe($e['traceparent']);

    Context::add('otro', 'del mensaje anterior');
    $sin = clienteActualizado(CLIENTE, 8);
    unset($sin['correlationId']);
    $sin['traceparent'] = 'no-valido';
    consumidor()->aplicar($sin);
    expect(Context::get('correlationId'))->not->toBe($e['correlationId'])->toMatch('/^[0-9a-f-]{36}$/')
        ->and(Context::get('traceparent'))->not->toBe($e['traceparent'])->toMatch('/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/')
        ->and(Context::has('otro'))->toBeFalse();
});
