<?php

namespace App\Infraestructura\Consola;

use App\Aplicacion\Catalogo\AplicarCopias;
use App\Aplicacion\Facturacion\FacturarEntrega;
use App\Aplicacion\Saga\LiberarPorCancelacion;
use App\Aplicacion\Saga\LiberarPorRechazo;
use App\Dominio\Comun\ErrorDeDominio;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PhpAmqpLib\Message\AMQPMessage;

/**
 * Consumidor de finanzas.eventos como proceso largo del plugin service de RoadRunner (D29). Inbox: el efecto y el
 * registro en inbox_eventos van en la misma transacción, así un evento repetido no se aplica dos veces (FC2).
 * Los manejadores por tipo llegan con cada flujo (F4 y F5); un tipo sin manejador va a la DLQ, no se pierde.
 */
final class ConsumirEventos extends Command
{
    protected $signature = 'eventos:consumir';

    protected $description = 'Consume finanzas.eventos con Inbox';

    /** @var array<string, callable(array<string, mixed>): void> tipo => manejador */
    private array $manejadores = [];

    public function handle(ConexionAmqp $amqp, AplicarCopias $copias, LiberarPorCancelacion $cancelaciones,
        FacturarEntrega $facturar, LiberarPorRechazo $rechazos): never
    {
        $this->registrarManejadores($copias, $cancelaciones, $facturar, $rechazos);

        // Proceso largo: RoadRunner lo reinicia si termina (plugin service, D29).
        for (; ;) {
            try {
                $canal = $amqp->canal();
                $canal->basic_qos(0, 10, false);
                $canal->basic_consume('finanzas.eventos', 'finanzas', false, false, false, false, fn (AMQPMessage $m) => $this->procesar($m));
                Log::info('eventos:consumir escuchando finanzas.eventos');
                $canal->consume();
            } catch (\Throwable $e) {
                Log::warning('eventos:consumir sin conexión, reintenta en 5 s', ['error' => $e->getMessage()]);
                $amqp->cerrar();
                sleep(5);
            }
        }
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

    private function procesar(AMQPMessage $mensaje): void
    {
        $sobre = json_decode($mensaje->getBody(), true);
        if (! is_array($sobre) || ! isset($this->manejadores[$sobre['tipo'] ?? ''])) {
            Log::warning('Evento sin manejador o inválido: va a la DLQ', ['tipo' => is_array($sobre) ? ($sobre['tipo'] ?? null) : null]);
            $mensaje->reject(false);

            return;
        }
        try {
            $this->aplicar($sobre);
        } catch (ErrorDeDominio $e) {
            // Regla de negocio (p. ej. una reserva que no está ACTIVA al facturar): reintentar no lo arregla (spec 006).
            Log::warning('Evento rechazado por una regla de negocio: va a la DLQ', ['tipo' => $sobre['tipo'], 'codigo' => $e->codigo,
                'mensaje' => $e->getMessage()]);
            $mensaje->reject(false);

            return;
        } catch (\TypeError|\ErrorException $e) {
            Log::warning('Evento sin los datos esperados: va a la DLQ', ['tipo' => $sobre['tipo'], 'error' => $e->getMessage()]);
            $mensaje->reject(false);

            return;
        }
        $mensaje->ack();
    }

    /**
     * Inbox (000 §6): el registro del eventId y el efecto van en la misma transacción.
     *
     * @param  array<string, mixed>  $sobre
     * @return bool true si el evento era nuevo y se aplicó
     */
    public function aplicar(array $sobre): bool
    {
        Context::add('correlationId', $sobre['correlationId'] ?? null);

        return DB::transaction(function () use ($sobre) {
            $nuevo = DB::table('inbox_eventos')->insertOrIgnore(['event_id' => $sobre['id'], 'tipo' => $sobre['tipo']]);
            if ($nuevo === 1) {
                ($this->manejadores[$sobre['tipo']])($sobre['datos']);
            }

            return $nuevo === 1;
        });
    }
}
