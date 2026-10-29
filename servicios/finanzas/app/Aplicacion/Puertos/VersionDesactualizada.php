<?php

namespace App\Aplicacion\Puertos;

/** Otro cambio ganó el bloqueo optimista; es técnico: la actividad o la petición se reintenta. */
final class VersionDesactualizada extends \RuntimeException {}
