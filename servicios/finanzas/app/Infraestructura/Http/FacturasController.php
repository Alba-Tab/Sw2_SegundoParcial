<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Facturacion\ConsultarFacturas;
use App\Aplicacion\Facturacion\RegistrarPago;
use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\Reloj;
use App\Dominio\Facturacion\Factura;
use App\Dominio\Facturacion\Pago;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Facturas y pagos (specs 006 y 008). La forma de la petición ya la validó ValidarContrato contra finanzas.yaml. */
final class FacturasController
{
    public function __construct(
        private readonly ConsultarFacturas $consultar,
        private readonly RegistrarPago $pagar,
        private readonly Idempotencia $idempotencia,
        private readonly CatalogoRepositorio $catalogo,
        private readonly Reloj $reloj,
    ) {}

    public function listar(Request $req): JsonResponse
    {
        $limite = (int) $req->query('limite', '20');
        $conSaldo = $req->query('conSaldo');
        $filtro = [
            'clienteId' => $req->query('clienteId'), 'estado' => $req->query('estado'),
            'conSaldo' => $conSaldo === null ? null : filter_var($conSaldo, FILTER_VALIDATE_BOOLEAN),
            'venceDesde' => $req->query('venceDesde'), 'venceHasta' => $req->query('venceHasta'),
        ];
        $items = $this->consultar->listar(SolicitanteHttp::de($req), $filtro, Formato::desdeCursor($req->query('cursor')), $limite + 1);
        $pagina = array_slice($items, 0, $limite);

        return new JsonResponse([
            'items' => array_map(fn (Factura $f) => $this->factura($f), $pagina),
            'siguienteCursor' => count($items) > $limite ? Formato::aCursor(end($pagina)->id) : null,
        ]);
    }

    public function obtener(Request $req, string $facturaId): JsonResponse
    {
        [$f, $pagos] = $this->consultar->detalle(SolicitanteHttp::de($req), $facturaId);

        return new JsonResponse($this->factura($f, $pagos));
    }

    public function pagos(Request $req, string $facturaId): JsonResponse
    {
        [, $pagos] = $this->consultar->detalle(SolicitanteHttp::de($req), $facturaId);

        return new JsonResponse(['items' => array_map(fn (Pago $p) => self::pago($p), $pagos)]);
    }

    public function pagar(Request $req, string $facturaId): JsonResponse
    {
        return $this->idempotencia->ejecutar($req, 'REGISTRAR_PAGO', function () use ($req, $facturaId) {
            [$f, $pago] = $this->pagar->ejecutar(SolicitanteHttp::de($req), $facturaId, $req->json('monto'), $req->json('fecha'),
                $req->json('medio'), (string) $req->json('referencia'), $req->json('nota'));
            [, $pagos] = $this->consultar->detalle(SolicitanteHttp::de($req), $facturaId);

            return new JsonResponse($this->factura($f, $pagos), 201, ['Location' => "/api/v1/facturas/{$facturaId}/pagos/{$pago->id}"]);
        });
    }

    /**
     * @param  list<Pago>|null  $pagos
     * @return array<string, mixed>
     */
    private function factura(Factura $f, ?array $pagos = null): array
    {
        $hoy = $this->reloj->ahora()->setTimezone(new \DateTimeZone('America/La_Paz'))->format('Y-m-d');
        $dias = $f->diasVencida($hoy);

        return array_filter([
            'facturaId' => $f->id, 'numero' => $f->numero, 'viajeId' => $f->viajeId, 'servicioId' => $f->servicioId,
            'clienteId' => $f->clienteId, 'razonSocial' => $this->catalogo->razonSocial($f->clienteId) ?? '',
            'monto' => $f->monto->aContrato(), 'saldo' => $f->saldo()->aContrato(), 'estado' => $f->estado(),
            'emitidaEl' => $f->emitidaEl, 'venceEl' => $f->venceEl, 'vencida' => $dias > 0, 'diasVencida' => $dias,
            'rutaId' => $f->servicio['rutaId'], 'tipoCarga' => $f->servicio['tipoCarga'],
            'toneladas' => $f->servicio['toneladas'] === null ? null : Formato::numero($f->servicio['toneladas']),
            'fechaViaje' => $f->servicio['fechaViaje'],
            'pagos' => $pagos === null ? null : array_map(fn (Pago $p) => self::pago($p), $pagos),
        ], fn ($v) => $v !== null);
    }

    /** @return array<string, mixed> */
    private static function pago(Pago $p): array
    {
        return array_filter([
            'pagoId' => $p->id, 'facturaId' => $p->facturaId, 'monto' => $p->monto->aContrato(), 'fecha' => $p->fecha,
            'medio' => $p->medio, 'referencia' => $p->referencia, 'nota' => $p->nota, 'registradoPor' => $p->registradoPor,
            'registradoEn' => Formato::instante($p->registradoEn),
        ], fn ($v) => $v !== null);
    }
}
