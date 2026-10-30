<?php

namespace App\Infraestructura\Consola;

use App\Aplicacion\Catalogo\AplicarCopias;
use App\Aplicacion\Facturacion\FacturarEntrega;
use App\Aplicacion\Saga\LiberarPorCancelacion;
use App\Aplicacion\Saga\LiberarPorRechazo;
use App\Dominio\Comun\ErrorDeDominio;
use App\Infraestructura\Log\Traza;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Persistencia\FallaTransitoria;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Message\AMQPMessage;

/**
 * Consumidor de finanzas.eventos como proceso largo del plugin service de RoadRunner (D29). Inbox: el efecto y el
 * registro en inbox_eventos van en la misma transacción, así un evento repetido no se aplica dos veces (FC2).
 *
 * Qué pasa con cada mensaje:
 * - Aplicado (o repetido): ack.
 * - Falla pasajera (PostgreSQL caído, interbloqueo, VersionDesactualizada): espera 2 s y vuelve a la cola (nack con
 *   requeue); la cola quorum lo manda a la DLQ si pasa su x-delivery-limit.
 * - Sin manejador, mal formado, regla de negocio u otro error determinista: a la DLQ (reject sin requeue), no se pierde.
 *
 * Con SIGTERM o SIGINT termina el mensaje en curso, cierra la conexión y sale con 0.
 */
final class ConsumirEventos extends Command
{
    protected $signature = 'eventos:consumir';

    protected $description = 'Consume finanzas.eventos con Inbox';

    /** @var array<string, callable(array<string, mixed>): void> tipo => manejador */
    private array $manejadores = [];

    private bool $detener = false;

    private ?AMQPChannel $canal = null;

    /** Segundos antes de devolver a la cola un mensaje con una falla pasajera. */
    public int $esperaReintento = 2;

    public function handle(ConexionAmqp $amqp, AplicarCopias $copias, LiberarPorCancelacion $cancelaciones,
        FacturarEntrega $facturar, LiberarPorRechazo $rechazos): int
    {
        $this->registrarManejadores($copias, $cancelaciones, $facturar, $rechazos);
        // El manejador solo marca: consume() revisa la marca cada segundo, fuera de cualquier lectura del socket.
        $this->trap([SIGTERM, SIGINT], function () {
            $this->detener = true;
            $this->canal?->stopConsume();
        });

        // Proceso largo: RoadRunner lo reinicia si termina sin que se lo pidan (plugin service, D29).
        while (! $this->detener) {
            try {
                $this->canal = $amqp->canal();
                $this->canal->basic_qos(0, 10, false);
                $this->canal->basic_consume('finanzas.eventos', 'finanzas', false, false, false, false,
                    fn (AMQPMessage $m) => $this->procesar($m));
                Log::info('eventos:consumir escuchando finanzas.eventos');
                $this->canal->consume(1.0);
            } catch (\Throwable $e) {
                if ($this->detener) {
                    break;
                }
                Log::warning('eventos:consumir sin conexión, reintenta en 5 s', ['error' => $e->getMessage()]);
                $amqp->cerrar();
                $this->canal = null;
                sleep(5);
            }
        }
        $amqp->cerrar();
        Log::info('eventos:consumir detenido');

        return self::SUCCESS;
    }

    /** tipo de evento => caso de uso. Los que no están aquí van a la DLQ. */
    public function registrarManejadores(AplicarCopias $copias, LiberarPorCancelacion $cancelaciones, FacturarEntrega $facturar,
        LiberarPorRechazo $rechazos): void
    {
        $this->manejadores = [
            'ClienteActualizado' => $copias->clienteActualizado(...),
            'RutaActualizada' => $copias->rutaActualizada(...),
            'ViajeCancelado' => $cancelaciones->viajeCancelado(...),
            'EntregaConfirmada' => $facturar->entregaConfirmada(...),
            'EntregaRechazada' => $rechazos->entregaRechazada(...),
        ];
    }

    /** Decide ack, nack (falla pasajera) o DLQ. Pública para las pruebas. */
    public function procesar(AMQPMessage $mensaje): void
    {
        $sobre = json_decode($mensaje->getBody(), true);
        $tipo = is_array($sobre) && is_string($sobre['tipo'] ?? null) ? $sobre['tipo'] : null;
        if ($tipo === null || ! isset($this->manejadores[$tipo])) {
            Log::warning('Evento sin manejador o inválido: va a la DLQ', ['tipo' => $tipo]);
            $mensaje->reject(false);

            return;
        }
        try {
            $this->aplicar($sobre);
        } catch (\Throwable $e) {
            if (FallaTransitoria::es($e)) {
                Log::warning('Evento con una falla pasajera: vuelve a la cola', ['tipo' => $tipo, 'error' => $e->getMessage()]);
                // Sin la espera, una caída corta de PostgreSQL agotaría x-delivery-limit en milisegundos.
                if (! $this->detener) {
                    sleep($this->esperaReintento);
                }
                $mensaje->nack(true);

                return;
            }
            // Regla de negocio (p. ej. una reserva que no está ACTIVA al facturar, spec 006), datos que no cumplen lo
            // esperado o un error de programación: reintentar no lo arregla.
            Log::warning('Evento rechazado: va a la DLQ', ['tipo' => $tipo, 'error' => $e::class, 'mensaje' => $e->getMessage()]
                + ($e instanceof ErrorDeDominio ? ['codigo' => $e->codigo] : []));
            $mensaje->reject(false);

            return;
        }
        $mensaje->ack();
    }

    /**
     * Inbox (000 §6): el registro del eventId y el efecto van en la misma transacción. El Context (correlationId y
     * traceparent) se reemplaza con los del sobre: nada del mensaje anterior pasa a los logs ni al Outbox.
     *
     * @param  array<string, mixed>  $sobre
     * @return bool true si el evento era nuevo y se aplicó
     */
    public function aplicar(array $sobre): bool
    {
        Traza::iniciar($sobre['correlationId'] ?? null, $sobre['traceparent'] ?? null);

        return DB::transaction(function () use ($sobre) {
            $nuevo = DB::table('inbox_eventos')->insertOrIgnore(['event_id' => $sobre['id'], 'tipo' => $sobre['tipo']]);
            if ($nuevo === 1) {
                ($this->manejadores[$sobre['tipo']])($sobre['datos']);
            }

            return $nuevo === 1;
        });
    }
}
