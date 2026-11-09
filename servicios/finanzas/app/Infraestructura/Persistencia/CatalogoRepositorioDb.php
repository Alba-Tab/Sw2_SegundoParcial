<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Dominio\Catalogo\Tarifa;
use App\Dominio\Comun\Monto;
use App\Dominio\Comun\TipoCarga;
use Illuminate\Support\Facades\DB;

/** Copias por evento con descarte de versiones viejas: la condición de versión va en el mismo UPSERT (sin carreras). */
final class CatalogoRepositorioDb implements CatalogoRepositorio
{
    public function clienteReplicado(string $clienteId): bool
    {
        return DB::table('cliente_copia')->where('cliente_id', $clienteId)->where('activo', true)->exists();
    }

    public function razonSocial(string $clienteId): ?string
    {
        $r = DB::table('cliente_copia')->where('cliente_id', $clienteId)->value('razon_social');

        return $r === null ? null : (string) $r;
    }

    public function contacto(string $clienteId): ?array
    {
        $c = DB::table('cliente_copia')->where('cliente_id', $clienteId)->first(['razon_social', 'correo']);

        return $c ? ['razonSocial' => (string) $c->razon_social, 'correo' => (string) $c->correo] : null;
    }

    public function rutaActiva(string $rutaId): bool
    {
        return DB::table('ruta_copia')->where('ruta_id', $rutaId)->where('activa', true)->exists();
    }

    public function tarifa(string $rutaId, TipoCarga $tipoCarga): ?Tarifa
    {
        $f = DB::table('tarifa')->where('ruta_id', $rutaId)->where('tipo_carga', $tipoCarga->value)->first();

        return $f ? new Tarifa($rutaId, $tipoCarga, Monto::bob((string) $f->por_tonelada)) : null;
    }

    public function aplicarCliente(array $datos): array
    {
        $existia = DB::table('cliente_copia')->where('cliente_id', $datos['clienteId'])->exists();
        $filas = DB::affectingStatement(<<<'SQL'
            INSERT INTO cliente_copia (cliente_id, razon_social, nit, correo, telefono, direccion, canal, tiene_cuenta, activo, version_agregado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (cliente_id) DO UPDATE SET razon_social = EXCLUDED.razon_social, nit = EXCLUDED.nit,
                correo = EXCLUDED.correo, telefono = EXCLUDED.telefono, direccion = EXCLUDED.direccion, canal = EXCLUDED.canal,
                tiene_cuenta = EXCLUDED.tiene_cuenta, activo = EXCLUDED.activo, version_agregado = EXCLUDED.version_agregado
            WHERE cliente_copia.version_agregado < EXCLUDED.version_agregado
            SQL, [$datos['clienteId'], $datos['razonSocial'], $datos['nit'], $datos['correo'], $datos['telefono'], $datos['direccion'],
            $datos['canal'], $datos['tieneCuenta'] ? 'true' : 'false', $datos['activo'] ? 'true' : 'false', $datos['versionAgregado']]);

        return ['aplicado' => $filas > 0, 'nuevo' => ! $existia && $filas > 0];
    }

    public function aplicarRuta(array $datos): bool
    {
        return DB::affectingStatement(<<<'SQL'
            INSERT INTO ruta_copia (ruta_id, nombre, distancia_km, activa, version_agregado, datos) VALUES (?, ?, ?, ?, ?, ?::jsonb)
            ON CONFLICT (ruta_id) DO UPDATE SET nombre = EXCLUDED.nombre, distancia_km = EXCLUDED.distancia_km,
                activa = EXCLUDED.activa, version_agregado = EXCLUDED.version_agregado, datos = EXCLUDED.datos
            WHERE ruta_copia.version_agregado < EXCLUDED.version_agregado
            SQL, [$datos['rutaId'], $datos['nombre'], $datos['distanciaKm'], $datos['activa'] ? 'true' : 'false',
            $datos['versionAgregado'], json_encode($datos, JSON_UNESCAPED_UNICODE)]) > 0;
    }
}
