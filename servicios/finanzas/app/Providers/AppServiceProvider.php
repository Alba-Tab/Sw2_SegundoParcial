<?php

namespace App\Providers;

use App\Aplicacion\Cotizacion\CrearCotizacion;
use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Aplicacion\Puertos\EvaluadorMora;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Aplicacion\Puertos\Reloj;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Persistencia\CatalogoRepositorioDb;
use App\Infraestructura\Persistencia\CotizacionRepositorioDb;
use App\Infraestructura\Persistencia\EvaluadorMoraSinFacturas;
use App\Infraestructura\Persistencia\LineaCreditoRepositorioDb;
use App\Infraestructura\Persistencia\RegistroDeEventosOutbox;
use App\Infraestructura\Persistencia\RelojSistema;
use DateInterval;
use Illuminate\Support\ServiceProvider;

/** Une los puertos de aplicacion con sus adaptadores de infraestructura. */
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(RegistroDeEventos::class, RegistroDeEventosOutbox::class);
        $this->app->singleton(ConexionAmqp::class);
        $this->app->bind(Reloj::class, RelojSistema::class);
        $this->app->bind(CotizacionRepositorio::class, CotizacionRepositorioDb::class);
        $this->app->bind(CatalogoRepositorio::class, CatalogoRepositorioDb::class);
        $this->app->bind(LineaCreditoRepositorio::class, LineaCreditoRepositorioDb::class);
        $this->app->bind(EvaluadorMora::class, EvaluadorMoraSinFacturas::class);
        $this->app->bind(CrearCotizacion::class, fn ($app) => new CrearCotizacion($app->make(CotizacionRepositorio::class),
            $app->make(CatalogoRepositorio::class), $app->make(Reloj::class), new DateInterval(config('servicio.cotizacion_vigencia'))));
    }
}
