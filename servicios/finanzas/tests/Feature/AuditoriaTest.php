<?php

use App\Aplicacion\Comun\Solicitante;
use App\Infraestructura\Persistencia\AuditoriaDb;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** actor_rol no depende del orden de realm_access.roles ni del rol compuesto `interno`. */
it('guarda el rol conocido aunque el token traiga interno primero', function (array $roles, ?string $esperado) {
    $id = (string) Str::uuid7();
    app(AuditoriaDb::class)->registrar(new Solicitante('sub-x', $roles, null), 'CENTRO_CONTROL', 'PROBAR', 'prueba', $id, []);

    expect(DB::table('auditoria')->where('entidad_id', $id)->value('actor_rol'))->toBe($esperado);
})->with([
    'interno y administracion' => [['interno', 'administracion'], 'administracion'],
    'solo interno' => [['interno'], null],
]);
