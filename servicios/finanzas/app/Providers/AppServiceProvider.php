<?php

namespace App\Providers;

use App\Aplicacion\Cotizacion\CrearCotizacion;
use App\Aplicacion\Puertos\CatalogoRepositorio;
use App\Aplicacion\Puertos\CotizacionRepositorio;
use App\Aplicacion\Puertos\EvaluadorMora;
use App\Aplicacion\Puertos\LineaCreditoRepositorio;
use App\Aplicacion\Puertos\RegistroDeEventos;
use App\Aplicacion\Puertos\Reloj;
use App\Aplicacion\Puertos\ReservaCreditoRepositorio;
use App\Aplicacion\Puertos\SolicitudAprobacionRepositorio;
use App\Infraestructura\Mensajeria\ConexionAmqp;
use App\Infraestructura\Persistencia\CatalogoRepositorioDb;
use App\Infraestructura\Persistencia\CotizacionRepositorioDb;
use App\Infraestructura\Persistencia\EvaluadorMoraDb;
use App\Infraestructura\Persistencia\LineaCreditoRepositorioDb;
use App\Infraestructura\Persistencia\RegistroDeEventosOutbox;
use App\Infraestructura\Persistencia\RelojSistema;
use App\Infraestructura\Persistencia\ReservaCreditoRepositorioDb;
use App\Infraestructura\Persistencia\SolicitudAprobacionRepositorioDb;
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
        $this->app->bind(EvaluadorMora::class, EvaluadorMoraDb::class);
        $this->app->bind(ReservaCreditoRepositorio::class, ReservaCreditoRepositorioDb::class);
        $this->app->bind(SolicitudAprobacionRepositorio::class, SolicitudAprobacionRepositorioDb::class);
        $this->app->bind(CrearCotizacion::class, fn ($app) => new CrearCotizacion($app->make(CotizacionRepositorio::class),
            $app->make(CatalogoRepositorio::class), $app->make(Reloj::class), new DateInterval(config('servicio.cotizacion_vigencia'))));
    }
}
