package bo.transporte.viajes.configuracion;

import bo.transporte.viajes.aplicacion.cliente.AltaDeCliente;
import bo.transporte.viajes.aplicacion.cliente.ConsultaDeClientes;
import bo.transporte.viajes.aplicacion.cliente.VinculacionDeCliente;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.VinculadorIdentidad;
import bo.transporte.viajes.aplicacion.ruta.ConsultaDeRutas;
import bo.transporte.viajes.aplicacion.servicio.ConfirmacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ConsultaDeServicios;
import bo.transporte.viajes.aplicacion.servicio.ParametrosSaga;
import bo.transporte.viajes.aplicacion.viaje.ProgramacionDeViaje;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Los casos de uso son clases de aplicación sin Spring; aquí se unen con sus adaptadores. */
@Configuration
class CasosDeUso {

    @Bean
    Clock reloj() {
        return Clock.systemUTC();
    }

    @Bean
    AltaDeCliente altaDeCliente(
            ClienteRepositorio clientes,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            VinculadorIdentidad identidad,
            Clock reloj) {
        return new AltaDeCliente(clientes, eventos, idempotencia, auditoria, tx, identidad, reloj);
    }

    @Bean
    VinculacionDeCliente vinculacionDeCliente(
            ClienteRepositorio clientes, VinculadorIdentidad identidad, Transacciones tx) {
        return new VinculacionDeCliente(clientes, identidad, tx);
    }

    @Bean
    ConsultaDeClientes consultaDeClientes(ClienteRepositorio clientes) {
        return new ConsultaDeClientes(clientes);
    }

    @Bean
    ConsultaDeRutas consultaDeRutas(RutaRepositorio rutas) {
        return new ConsultaDeRutas(rutas);
    }

    @Bean
    ParametrosSaga parametrosSaga(
            @Value("${saga.espera-aprobacion}") Duration espera,
            @Value("${saga.compensacion.schedule-to-close}") Duration compensacion,
            @Value("${saga.compensacion.maximo-intentos}") int intentos) {
        return new ParametrosSaga(espera, compensacion, intentos);
    }

    @Bean
    ConfirmacionDeServicio confirmacionDeServicio(
            ServicioRepositorio servicios,
            ClienteRepositorio clientes,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Orquestador orquestador,
            ParametrosSaga parametros,
            Clock reloj) {
        return new ConfirmacionDeServicio(
                servicios, clientes, idempotencia, auditoria, tx, orquestador, parametros, reloj);
    }

    @Bean
    ConsultaDeServicios consultaDeServicios(ServicioRepositorio servicios, Orquestador orquestador) {
        return new ConsultaDeServicios(servicios, orquestador);
    }

    @Bean
    ProgramacionDeViaje programacionDeViaje(
            ServicioRepositorio servicios,
            ViajeRepositorio viajes,
            RegistroDeEventos eventos,
            Transacciones tx,
            Clock reloj) {
        return new ProgramacionDeViaje(servicios, viajes, eventos, tx, reloj);
    }
}
