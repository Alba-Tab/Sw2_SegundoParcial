package bo.transporte.viajes.aplicacion.servicio;

import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio.ConViaje;
import bo.transporte.viajes.dominio.viaje.Asignacion;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Servicio;

/** Servicio con el estado de su viaje; {@code etapa} solo en PROGRAMANDO y {@code asignacion} desde el pivote. */
public record ServicioVista(Servicio servicio, EstadoViaje estado, String etapa, String motivo, Asignacion asignacion) {
    static ServicioVista de(ConViaje f, String etapa) {
        var v = f.viaje();
        return new ServicioVista(
                f.servicio(), f.estado(), etapa, v == null ? null : v.motivo(), v == null ? null : v.asignacion());
    }
}
