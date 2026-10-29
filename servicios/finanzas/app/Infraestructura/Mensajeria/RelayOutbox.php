<?php

namespace App\Infraestructura\Mensajeria;

use Illuminate\Support\Facades\DB;
use PhpAmqpLib\Message\AMQPMessage;

/**
 * Publica outbox_eventos en transporte.events con confirmación del broker y marca publicado_en (000 §6).
 * FOR UPDATE SKIP LOCKED evita publicar dos veces la misma fila con varias instancias; si el broker no confirma,
 * la transacción se revierte y la fila se reintenta en la siguiente vuelta (FC5).
 */
final class RelayOutbox
{
    public const EXCHANGE = 'transporte.events';

    public function __construct(private readonly ConexionAmqp $amqp) {}

    public function publicarPendientes(): int
    {
        return DB::transaction(function () {
            $filas = DB::select('SELECT id, clave_enrutamiento, sobre::text AS sobre FROM outbox_eventos
                WHERE publicado_en IS NULL ORDER BY creado_en LIMIT ? FOR UPDATE SKIP LOCKED', [config('servicio.outbox.lote')]);
            if ($filas === []) {
                return 0;
            }
            $canal = $this->amqp->canal();
            foreach ($filas as $f) {
                $canal->basic_publish(new AMQPMessage($f->sobre, [
                    'content_type' => 'application/json',
                    'content_encoding' => 'utf-8',
                    'message_id' => $f->id,
                    'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
                ]), self::EXCHANGE, $f->clave_enrutamiento);
            }
            $canal->wait_for_pending_acks_returns(10);
            DB::table('outbox_eventos')->whereIn('id', array_column($filas, 'id'))->update(['publicado_en' => now('UTC')]);

            return count($filas);
        });
    }
}
