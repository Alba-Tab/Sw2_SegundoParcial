<?php

namespace App\Aplicacion\Facturacion;

use App\Aplicacion\Puertos\Auditoria;
use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Aplicacion\Puertos\FacturaRepositorio;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Puertos\ReservaCreditoRepositorio;
use App\Dominio\Comun\ErrorDeDominio;
use App\Dominio\Facturacion\Factura;

/**
 * Consumidor de EntregaConfirmada (spec 006, paso 6), dentro de la transacción del Inbox: una factura por viaje por el
 * monto de la reserva, que pasa a CONSUMIDA; la línea consume el monto (reservado baja, utilizado sube) y queda
 * FacturaEmitida en el Outbox con lo que n8n necesita para el correo. Una reserva que no está ACTIVA va a la DLQ.
 */
final class FacturarEntrega
{
    public function __construct(
        private readonly FacturaRepositorio $facturas,
        private readonly ReservaCreditoRepositorio $reservas,
        private readonly LineaCreditoRepositorio $lineas,
        private readonly CotizacionRepositorio $cotizaciones,
        private readonly CatalogoRepositorio $catalogo,
        private readonly RegistroDeEventos $eventos,
        private readonly Auditoria $auditoria,
        private readonly Reloj $reloj,
        private readonly string $portalUrl,
    ) {}

    /** @param  array<string, mixed>  $datos  contratos/eventos/viajes/EntregaConfirmada.v1 */
    public function entregaConfirmada(array $datos): void
    {
        if ($this->facturas->delViaje($datos['viajeId']) !== null) {
            return;
        }
        $reserva = $this->reservas->paraActualizar($datos['servicioId'])
            ?? throw new ErrorDeDominio('CONFLICTO_ESTADO', 'El servicio no tiene reserva de crédito');
        $reserva->consumir();
        $cotizacion = $this->cotizaciones->porId($reserva->cotizacionId);
        $hoy = $this->reloj->ahora()->setTimezone(new \DateTimeZone('America/La_Paz'))->format('Y-m-d');
        $factura = Factura::emitir($this->facturas->siguienteNumero(), $datos['viajeId'], $datos['servicioId'], $reserva->clienteId,
            $reserva->monto, $hoy, [
                'rutaId' => $cotizacion?->rutaId,
                'tipoCarga' => $cotizacion?->tipoCarga->value,
                'toneladas' => $cotizacion?->toneladas,
                'fechaViaje' => $cotizacion?->fechaViaje,
            ]);
        $linea = $this->lineas->paraActualizar($reserva->clienteId)
            ?? throw new ErrorDeDominio('CONFLICTO_ESTADO', 'El cliente no tiene línea de crédito');

        $this->facturas->insertar($factura);
        $this->reservas->guardar($reserva);
        $this->lineas->actualizar($linea->consumir($reserva->monto));
        $cliente = $this->catalogo->contacto($reserva->clienteId);
        $this->eventos->registrar('FacturaEmitida', 'finanzas.factura-emitida.v1', [
            'facturaId' => $factura->id,
            'numero' => $factura->numero,
            'viajeId' => $factura->viajeId,
            'servicioId' => $factura->servicioId,
            'clienteId' => $factura->clienteId,
            'monto' => $factura->monto->aContrato(),
            'emitidaEl' => $factura->emitidaEl,
            'venceEl' => $factura->venceEl,
            'cliente' => ['razonSocial' => $cliente['razonSocial'] ?? '', 'correo' => $cliente['correo'] ?? ''],
            'enlacePortal' => rtrim($this->portalUrl, '/').'/facturas/'.$factura->id,
        ]);
        $this->auditoria->registrar(null, 'SISTEMA', 'EMITIR_FACTURA', 'Factura', $factura->id,
            ['numero' => $factura->numero, 'viajeId' => $factura->viajeId, 'monto' => $factura->monto->aContrato()]);
    }
}
