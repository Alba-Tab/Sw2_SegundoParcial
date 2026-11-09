<?php

namespace App\Aplicacion\Puertos;

/** Mora (D04): al menos una factura con saldo > 0 vencida hace más de 7 días. */
interface EvaluadorMora
{
    public function enMora(string $clienteId, \DateTimeImmutable $ahora): bool;

    /**
     * De esos clientes, los que están en mora, en una sola consulta (lectura por lotes).
     *
     * @param  list<string>  $clienteIds
     * @return list<string>
     */
    public function clientesEnMora(array $clienteIds, \DateTimeImmutable $ahora): array;

    /**
     * Facturas con saldo ya vencidas, para el detalle de la solicitud de aprobación (spec 012).
     *
     * @return list<array{facturaId: string, numero: string, saldo: array{monto: string, moneda: string}, venceEl: string, diasVencida: int}>
     */
    public function facturasVencidas(string $clienteId, \DateTimeImmutable $ahora): array;
}
