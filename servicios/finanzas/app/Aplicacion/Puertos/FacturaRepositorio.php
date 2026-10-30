<?php

namespace App\Aplicacion\Puertos;

use App\Dominio\Facturacion\Factura;

interface FacturaRepositorio
{
    public function porId(string $facturaId, bool $bloquear = false): ?Factura;

    public function delViaje(string $viajeId): ?Factura;

    /** FAC- + 6 dígitos de factura_numero_seq (puede tener saltos, spec 006). */
    public function siguienteNumero(): string;

    public function insertar(Factura $f): void;

    public function actualizar(Factura $f): void;

    /**
     * @param  array{clienteId?: ?string, estado?: ?string, conSaldo?: ?bool, venceDesde?: ?string, venceHasta?: ?string}  $filtro
     * @return list<Factura> ordenadas por id (UUIDv7) después del cursor
     */
    public function listar(array $filtro, ?string $despuesDe, int $limite): array;
}
