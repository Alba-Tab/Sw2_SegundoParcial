<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\SolicitudAprobacionRepositorio;
use App\Dominio\Comun\Monto;
use App\Dominio\Credito\SolicitudAprobacion;
use Illuminate\Support\Facades\DB;

final class SolicitudAprobacionRepositorioDb implements SolicitudAprobacionRepositorio
{
    public function porServicio(string $servicioId, bool $bloquear = false): ?SolicitudAprobacion
    {
        $f = DB::table('solicitud_aprobacion')->where('servicio_id', $servicioId)
            ->when($bloquear, fn ($q) => $q->lockForUpdate())->first();

        return $f ? self::fila($f) : null;
    }

    public function guardar(SolicitudAprobacion $s): void
    {
        DB::table('solicitud_aprobacion')->upsert([[
            'servicio_id' => $s->servicioId,
            'cliente_id' => $s->clienteId,
            'monto' => $s->monto->aContrato()['monto'],
            'motivos' => '{'.implode(',', $s->motivos).'}',
            'estado' => $s->estado(),
            'creada_en' => $s->creadaEn,
            'vence_en' => $s->venceEn,
            'decidida_por' => $s->decididaPor(),
            'decidida_en' => $s->decididaEn(),
            'motivo_decision' => $s->motivoDecision(),
        ]], ['servicio_id'], ['estado', 'decidida_por', 'decidida_en', 'motivo_decision']);
    }

    public function listar(?string $estado, ?string $despuesDe, int $limite): array
    {
        return DB::table('solicitud_aprobacion')
            ->when($estado, fn ($q) => $q->where('estado', $estado))
            ->when($despuesDe, fn ($q) => $q->where('servicio_id', '>', $despuesDe))
            ->orderBy('servicio_id')->limit($limite)->get()
            ->map(fn ($f) => self::fila($f))->values()->all();
    }

    private static function fila(object $f): SolicitudAprobacion
    {
        $utc = new \DateTimeZone('UTC');
        $motivos = array_values(array_filter(explode(',', trim((string) $f->motivos, '{}'))));

        return SolicitudAprobacion::reconstruir($f->servicio_id, $f->cliente_id, Monto::bob((string) $f->monto), $motivos, $f->estado,
            new \DateTimeImmutable($f->creada_en, $utc), new \DateTimeImmutable($f->vence_en, $utc), $f->decidida_por,
            $f->decidida_en ? new \DateTimeImmutable($f->decidida_en, $utc) : null, $f->motivo_decision);
    }
}
