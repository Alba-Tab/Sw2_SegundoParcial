<?php

namespace App\Infraestructura\Persistencia;

use App\Aplicacion\Puertos\VersionDesactualizada;
use Illuminate\Database\ConcurrencyErrorDetector;
use Illuminate\Database\LostConnectionDetector;
use Illuminate\Database\LostConnectionException;
use Illuminate\Database\QueryException;
use PDOException;

/**
 * Distingue un error técnico pasajero (PostgreSQL caído o reiniciándose, interbloqueo, bloqueo optimista perdido) de uno
 * determinista (dato inválido, regla de negocio, error de programación). El pasajero se reintenta (el consumidor lo
 * devuelve a la cola; la API responde 503 o repite la transacción); el determinista no.
 */
final class FallaTransitoria
{
    /**
     * Clases de SQLSTATE pasajeras: 08 conexión, 40 transacción revertida (interbloqueo, serialización), 53 recursos
     * (demasiadas conexiones), 57 intervención del operador (apagado, arranque, cancelación) y 58 error del sistema.
     */
    private const CLASES_SQLSTATE = ['08', '40', '53', '57', '58'];

    /** 55P03: no se pudo tomar el bloqueo (lock_timeout). */
    private const SQLSTATE = ['55P03'];

    public static function es(\Throwable $e): bool
    {
        for ($x = $e; $x !== null; $x = $x->getPrevious()) {
            if ($x instanceof VersionDesactualizada || $x instanceof LostConnectionException) {
                return true;
            }
            if ($x instanceof QueryException || $x instanceof PDOException) {
                $estado = self::sqlstate($x);
                if (in_array(substr($estado, 0, 2), self::CLASES_SQLSTATE, true) || in_array($estado, self::SQLSTATE, true)
                    || (new LostConnectionDetector)->causedByLostConnection($x)
                    || (new ConcurrencyErrorDetector)->causedByConcurrencyError($x)) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function sqlstate(QueryException|PDOException $e): string
    {
        $info = $e->errorInfo ?? null;

        return is_array($info) && isset($info[0]) ? (string) $info[0] : (string) $e->getCode();
    }
}
