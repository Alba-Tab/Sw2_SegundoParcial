package bo.transporte.viajes.aplicacion.dispositivo;

import bo.transporte.viajes.aplicacion.comun.Solicitante;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenGps;
import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio.Dispositivo;
import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio.Plataforma;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.time.Clock;
import java.util.OptionalLong;
import java.util.UUID;

/**
 * PUT /dispositivos/mio y GET /dispositivos/{id}/cursor (spec 005). El registro es un reemplazo completo, no una
 * operación de negocio (sin operacion_idempotente); el cursor solo lo lee el chofer que registró el dispositivo.
 */
public class DispositivosDelChofer {
    private final DispositivoRepositorio dispositivos;
    private final AlmacenGps almacen;
    private final Clock reloj;

    public DispositivosDelChofer(DispositivoRepositorio dispositivos, AlmacenGps almacen, Clock reloj) {
        this.dispositivos = dispositivos;
        this.almacen = almacen;
        this.reloj = reloj;
    }

    public Dispositivo registrar(Solicitante quien, UUID dispositivoId, Plataforma plataforma, String tokenPush) {
        if (!quien.tiene("chofer"))
            throw new ErrorDeDominio("SIN_PERMISO", "Solo la app del chofer registra un dispositivo");
        // D45: en iOS (cuenta gratuita de Apple) no hay push; un token ahí se ignora.
        var d = new Dispositivo(
                dispositivoId,
                quien.sub(),
                plataforma,
                plataforma == Plataforma.ANDROID ? tokenPush : null,
                reloj.instant());
        dispositivos.guardar(d);
        return d;
    }

    public OptionalLong cursor(Solicitante quien, UUID dispositivoId, UUID viajeId) {
        var d = dispositivos
                .porId(dispositivoId)
                .orElseThrow(() -> new ErrorDeDominio("NO_ENCONTRADO", "No existe el dispositivo"));
        if (!d.usuarioSub().equals(quien.sub())) {
            throw new ErrorDeDominio("SIN_PERMISO", "El dispositivo es de otro chofer");
        }
        return almacen.cursor(dispositivoId, viajeId);
    }
}
