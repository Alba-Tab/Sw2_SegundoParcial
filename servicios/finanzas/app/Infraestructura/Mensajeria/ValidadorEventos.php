<?php

namespace App\Infraestructura\Mensajeria;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;

/**
 * Valida cada sobre contra contratos/eventos (copiados en la imagen) antes de escribirlo en el Outbox (000 §6). Los
 * `$id` de los esquemas son https://transporte.local/contratos/…, así que los `$ref` relativos se resuelven contra la copia.
 */
final class ValidadorEventos
{
    private readonly Validator $validador;

    public function __construct(private readonly string $directorio)
    {
        $this->validador = new Validator;
        $this->validador->resolver()->registerPrefix('https://transporte.local/contratos/', rtrim($directorio, '/').'/');
        $this->validador->parser()->setOption('allowFormats', true);
    }

    /** @param  array<string, mixed>  $sobre */
    public function validar(string $productor, string $tipo, int $version, array $sobre): void
    {
        $archivo = "https://transporte.local/contratos/eventos/{$productor}/{$tipo}.v{$version}.schema.json";
        $datos = json_decode(json_encode($sobre, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), false);
        $r = $this->validador->validate($datos, $archivo);
        if (! $r->isValid()) {
            $errores = (new ErrorFormatter)->format($r->error(), false);
            throw new \LogicException("{$tipo} v{$version} no cumple su contrato: ".json_encode($errores, JSON_UNESCAPED_UNICODE));
        }
    }
}
