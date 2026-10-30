<?php

namespace App\Aplicacion\Facturacion;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\FacturaRepositorio;
use App\Aplicacion\Puertos\PagoRepositorio;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Facturacion\Factura;
use App\Dominio\Facturacion\Pago;

/**
 * GET /facturas y /facturas/{id} (specs 006 y 008). El cliente ve solo las suyas: en la lista el clienteId sale del
 * token y el del parámetro se ignora (000 §8). Administración y gerente ven todas; comercial solo con clienteId.
 */
final class ConsultarFacturas
{
    private const VEN_TODAS = ['administracion', 'gerente'];

    public function __construct(private readonly FacturaRepositorio $facturas, private readonly PagoRepositorio $pagos) {}

    /**
     * @param  array{clienteId?: ?string, estado?: ?string, conSaldo?: ?bool, venceDesde?: ?string, venceHasta?: ?string}  $filtro
     * @return list<Factura>
     */
    public function listar(Solicitante $quien, array $filtro, ?string $despuesDe, int $limite): array
    {
        if ($quien->tiene('cliente') && $quien->clienteId) {
            $filtro['clienteId'] = $quien->clienteId;
        } elseif ($quien->tiene('comercial') && ! $quien->tieneAlguno(self::VEN_TODAS)) {
            if (empty($filtro['clienteId'])) {
                throw new ErrorDeDominio('VALIDACION', 'clienteId: atención comercial lo debe indicar', ['campo' => 'clienteId']);
            }
        } elseif (! $quien->tieneAlguno(self::VEN_TODAS)) {
            throw new ErrorDeDominio('SIN_PERMISO', 'Sin permiso para ver facturas');
        }

        return $this->facturas->listar($filtro, $despuesDe, $limite);
    }

    /** @return array{0: Factura, 1: list<Pago>} */
    public function detalle(Solicitante $quien, string $facturaId): array
    {
        $f = $this->facturas->porId($facturaId) ?? throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la factura');
        $propia = $quien->tiene('cliente') && $quien->clienteId === $f->clienteId;
        if (! $propia && ! $quien->tieneAlguno([...self::VEN_TODAS, 'comercial'])) {
            throw new ErrorDeDominio('SIN_PERMISO', 'La factura es de otro cliente');
        }

        return [$f, $this->pagos->deFactura($facturaId)];
    }
}
