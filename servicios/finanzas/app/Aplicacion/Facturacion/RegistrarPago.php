<?php

namespace App\Aplicacion\Facturacion;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\Auditoria;
use App\Aplicacion\Puertos\FacturaRepositorio;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\PagoRepositorio;
use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Aplicacion\Puertos\Reloj;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Comun\Monto;
use App\Dominio\Facturacion\Factura;
use App\Dominio\Facturacion\Pago;

/**
 * POST /api/v1/facturas/{id}/pagos (spec 008), dentro de la transacción de la idempotencia: solo administración; el
 * pago baja el saldo, la línea se abona (utilizado baja) y queda PagoRegistrado en el Outbox con el saldo y el estado.
 */
final class RegistrarPago
{
    public function __construct(
        private readonly FacturaRepositorio $facturas,
        private readonly PagoRepositorio $pagos,
        private readonly LineaCreditoRepositorio $lineas,
        private readonly RegistroDeEventos $eventos,
        private readonly Auditoria $auditoria,
        private readonly Reloj $reloj,
    ) {}

    /**
     * @param  array{monto: string, moneda: string}  $monto
     * @return array{0: Factura, 1: Pago}
     */
    public function ejecutar(Solicitante $quien, string $facturaId, array $monto, string $fecha, string $medio, string $referencia,
        ?string $nota): array
    {
        if (! $quien->tiene('administracion')) {
            throw new ErrorDeDominio('SIN_PERMISO', 'Solo administración registra pagos');
        }
        try {
            $valor = Monto::desdeContrato($monto);
        } catch (ErrorDeDominio $e) {
            throw new ErrorDeDominio('VALIDACION', 'monto: '.$e->getMessage(), ['campo' => 'monto']);
        }
        $factura = $this->facturas->porId($facturaId, bloquear: true)
            ?? throw new ErrorDeDominio('NO_ENCONTRADO', 'No existe la factura');
        $repetido = $this->pagos->porReferencia($facturaId, $medio, trim($referencia));
        if ($repetido !== null) {
            throw new ErrorDeDominio('PAGO_DUPLICADO', 'Ese pago ya está registrado en esta factura', ['pagoId' => $repetido->id]);
        }
        $ahora = $this->reloj->ahora();
        $hoy = $ahora->setTimezone(new \DateTimeZone('America/La_Paz'))->format('Y-m-d');
        $factura->registrarPago($valor, $fecha, $hoy);
        $pago = Pago::registrar($facturaId, $valor, $fecha, $medio, $referencia, $nota, $quien->sub, $ahora);
        $linea = $this->lineas->paraActualizar($factura->clienteId)
            ?? throw new ErrorDeDominio('CONFLICTO_ESTADO', 'El cliente no tiene línea de crédito');

        $this->pagos->insertar($pago);
        $this->facturas->actualizar($factura);
        $this->lineas->actualizar($linea->abonar($valor));
        $this->eventos->registrar('PagoRegistrado', 'finanzas.pago-registrado.v1', [
            'pagoId' => $pago->id,
            'facturaId' => $factura->id,
            'numeroFactura' => $factura->numero,
            'clienteId' => $factura->clienteId,
            'monto' => $valor->aContrato(),
            'fecha' => $fecha,
            'medio' => $medio,
            'referencia' => $pago->referencia,
            'saldoFactura' => $factura->saldo()->aContrato(),
            'estadoFactura' => $factura->estado(),
        ]);
        $this->auditoria->registrar($quien, 'CENTRO_CONTROL', 'REGISTRAR_PAGO', 'Factura', $factura->id,
            ['monto' => $valor->aContrato(), 'referencia' => $pago->referencia, 'medio' => $medio]);

        return [$factura, $pago];
    }
}
