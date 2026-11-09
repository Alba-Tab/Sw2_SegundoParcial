package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.DispositivosApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CursorSincronizacionDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.DispositivoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.DispositivoNuevoDto;
import bo.transporte.viajes.aplicacion.dispositivo.DispositivosDelChofer;
import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio.Plataforma;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** El celular del chofer y su cursor de sincronización (spec 005, D45, D55). */
@RestController
class DispositivosController implements DispositivosApi {
    private final DispositivosDelChofer dispositivos;

    DispositivosController(DispositivosDelChofer dispositivos) {
        this.dispositivos = dispositivos;
    }

    @Override
    public ResponseEntity<DispositivoDto> registrarDispositivo(DispositivoNuevoDto cuerpo) {
        var d = dispositivos.registrar(
                SolicitanteActual.obtener(),
                cuerpo.getDispositivoId(),
                Plataforma.valueOf(cuerpo.getPlataforma().getValue()),
                cuerpo.getTokenPush());
        return ResponseEntity.ok(new DispositivoDto()
                .dispositivoId(d.dispositivoId())
                .plataforma(
                        DispositivoDto.PlataformaEnum.fromValue(d.plataforma().name()))
                .tokenPush(d.tokenPush())
                .actualizadoEn(d.actualizadoEn().atOffset(ZoneOffset.UTC)));
    }

    @Override
    public ResponseEntity<CursorSincronizacionDto> obtenerCursorSincronizacion(UUID dispositivoId, UUID viajeId) {
        var c = dispositivos.cursor(SolicitanteActual.obtener(), dispositivoId, viajeId);
        return ResponseEntity.ok(new CursorSincronizacionDto()
                .dispositivoId(dispositivoId)
                .viajeId(viajeId)
                .ultimaSecuencia(c.isPresent() ? Math.toIntExact(c.getAsLong()) : null));
    }
}
