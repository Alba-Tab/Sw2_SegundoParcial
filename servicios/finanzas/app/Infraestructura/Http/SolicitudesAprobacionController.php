<?php

namespace App\Infraestructura\Http;

use App\Aplicacion\Credito\ConsultarSolicitudes;
use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Dominio\Credito\SolicitudAprobacion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /api/v1/solicitudes-aprobacion y /{servicioId} (spec 012). */
final class SolicitudesAprobacionController
{
    public function __construct(private readonly ConsultarSolicitudes $consultar, private readonly CatalogoRepositorio $catalogo) {}

    public function listar(Request $req): JsonResponse
    {
        $limite = (int) $req->query('limite', '20');
        $items = $this->consultar->listar(SolicitanteHttp::de($req), $req->query('estado'), Formato::desdeCursor($req->query('cursor')), $limite + 1);
        $pagina = array_slice($items, 0, $limite);

        return new JsonResponse([
            'items' => array_map(fn ($s) => $this->formato($s), $pagina),
            'siguienteCursor' => count($items) > $limite ? Formato::aCursor(end($pagina)->servicioId) : null,
        ]);
    }

    public function obtener(Request $req, string $servicioId): JsonResponse
    {
        [$s, $facturas] = $this->consultar->detalle(SolicitanteHttp::de($req), $servicioId);

        return new JsonResponse($this->formato($s) + ['facturasVencidas' => $facturas]);
    }

    /** @return array<string, mixed> */
    private function formato(SolicitudAprobacion $s): array
    {
        return array_filter([
            'servicioId' => $s->servicioId,
            'clienteId' => $s->clienteId,
            'razonSocial' => $this->catalogo->razonSocial($s->clienteId) ?? '',
            'monto' => $s->monto->aContrato(),
            'motivos' => $s->motivos,
            'estado' => $s->estado(),
            'creadaEn' => Formato::instante($s->creadaEn),
            'venceEn' => Formato::instante($s->venceEn),
            'decididaPor' => $s->decididaPor(),
            'decididaEn' => $s->decididaEn() ? Formato::instante($s->decididaEn()) : null,
            'motivoDecision' => $s->motivoDecision(),
        ], fn ($v) => $v !== null);
    }
}
