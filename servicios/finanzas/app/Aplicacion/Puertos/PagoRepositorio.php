<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Facturacion\Pago;

interface PagoRepositorio
{
    public function insertar(Pago $p): void;

    /** @return list<Pago> */
    public function deFactura(string $facturaId): array;

    /** El pago con la misma referencia y medio en esa factura (índice único, spec 008). */
    public function porReferencia(string $facturaId, string $medio, string $referencia): ?Pago;
}
