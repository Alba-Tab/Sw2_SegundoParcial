package bo.transporte.viajes.aplicacion.viaje;

import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio.UltimaPosicion;
import bo.transporte.viajes.dominio.comun.TipoCarga;
import bo.transporte.viajes.dominio.ruta.Ruta;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * El viaje como lo ve el chofer y el Centro de Control: con cliente y ruta, sin montos (D51). Es un record plano para
 * poder guardarlo como respuesta de una operación idempotente.
 */
public record ViajeVista(
        UUID viajeId,
        UUID servicioId,
        EstadoViaje estado,
        String motivo,
        UUID clienteId,
        String razonSocial,
        Ruta ruta,
        TipoCarga tipoCarga,
        BigDecimal toneladas,
        LocalDate fechaViaje,
        String placa,
        String choferNombre,
        Instant iniciadoEn,
        UltimaPosicion ultimaPosicion) {

    static ViajeVista de(Viaje v, String razonSocial, Ruta ruta, UltimaPosicion ultimaPosicion) {
        var a = v.asignacion();
        return new ViajeVista(
                v.viajeId(),
                v.servicioId(),
                v.estado(),
                v.motivo(),
                v.clienteId(),
                razonSocial,
                ruta,
                a.tipoCarga(),
                a.toneladas(),
                a.fechaViaje(),
                a.placa(),
                a.choferNombre(),
                v.iniciadoEn(),
                ultimaPosicion);
    }
}
