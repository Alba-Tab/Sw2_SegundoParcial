<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Comun\Solicitante;
use App\Aplicacion\Puertos\Auditoria;
use App\Dominio\Comun\Uuid7;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Facades\DB;

/** Tabla auditoria (000 §9), en la transacción del caso de uso. */
final class AuditoriaDb implements Auditoria
{
    /** Roles de 000 §8 por prioridad: Keycloak no garantiza el orden de realm_access.roles y puede traer `interno`. */
    private const ROLES = ['gerente', 'administracion', 'comercial', 'despachador', 'jefe_flota', 'chofer', 'agente_lectura', 'cliente'];

    public function registrar(?Solicitante $quien, string $canal, string $accion, string $entidad, string $entidadId, array $datos): void
    {
        $correlacion = Context::get('correlationId');
        DB::table('auditoria')->insert([
            'id' => Uuid7::nuevo(), 'ocurrido_en' => now('UTC'), 'actor_sub' => $quien?->sub, 'actor_rol' => array_values(array_intersect(self::ROLES, $quien->roles ?? []))[0] ?? null,
            'canal' => $canal, 'accion' => $accion, 'entidad' => $entidad, 'entidad_id' => $entidadId,
            'datos' => json_encode($datos, JSON_UNESCAPED_UNICODE),
            'correlation_id' => is_string($correlacion) && preg_match('/^[0-9a-f-]{36}$/', $correlacion) ? $correlacion : null,
        ]);
    }
}
