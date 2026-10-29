<?php

namespace App\Providers;

use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Persistencia\RegistroDeEventosOutbox;
use Illuminate\Support\ServiceProvider;

/** Une los puertos de aplicacion con sus adaptadores de infraestructura. */
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(RegistroDeEventos::class, RegistroDeEventosOutbox::class);
        $this->app->singleton(ConexionAmqp::class);
    }
}
