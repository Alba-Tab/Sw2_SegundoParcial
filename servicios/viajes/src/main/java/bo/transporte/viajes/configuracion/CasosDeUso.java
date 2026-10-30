package bo.transporte.viajes.configuracion;

import bo.transporte.viajes.aplicacion.cliente.AltaDeCliente;
import bo.transporte.viajes.aplicacion.cliente.ConsultaDeClientes;
import bo.transporte.viajes.aplicacion.cliente.VinculacionDeCliente;
import bo.transporte.viajes.aplicacion.dispositivo.DispositivosDelChofer;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias;
import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenGps;
import bo.transporte.viajes.aplicacion.puerto.salida.Auditoria;
import bo.transporte.viajes.aplicacion.puerto.salida.BitacoraRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.ClienteRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.DispositivoRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.EntregaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.EvidenciaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Inbox;
import bo.transporte.viajes.aplicacion.puerto.salida.Orquestador;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroDeEventos;
import bo.transporte.viajes.aplicacion.puerto.salida.RegistroIdempotente;
import bo.transporte.viajes.aplicacion.puerto.salida.RutaRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.ServicioRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.Transacciones;
import bo.transporte.viajes.aplicacion.puerto.salida.UltimaPosicionRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.aplicacion.puerto.salida.VinculadorIdentidad;
import bo.transporte.viajes.aplicacion.ruta.ConsultaDeRutas;
import bo.transporte.viajes.aplicacion.saga.DecisionDeCredito;
import bo.transporte.viajes.aplicacion.saga.ResolucionDeIntervencion;
import bo.transporte.viajes.aplicacion.servicio.CancelacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ConfirmacionDeServicio;
import bo.transporte.viajes.aplicacion.servicio.ConsultaDeServicios;
import bo.transporte.viajes.aplicacion.servicio.ParametrosSaga;
import bo.transporte.viajes.aplicacion.viaje.BitacoraDeRuta;
import bo.transporte.viajes.aplicacion.viaje.CierreDeViaje;
import bo.transporte.viajes.aplicacion.viaje.ConsultaDeViajes;
import bo.transporte.viajes.aplicacion.viaje.EntregaDeViaje;
import bo.transporte.viajes.aplicacion.viaje.InicioDeViaje;
import bo.transporte.viajes.aplicacion.viaje.ProgramacionDeViaje;
import bo.transporte.viajes.aplicacion.viaje.RecorridoDeViaje;
import bo.transporte.viajes.aplicacion.viaje.RegistroDeGps;
import bo.transporte.viajes.aplicacion.viaje.SubidaDeEvidencia;
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
    ConsultaDeServicios consultaDeServicios(
            ServicioRepositorio servicios, Orquestador orquestador, UltimaPosicionRepositorio posiciones) {
        return new ConsultaDeServicios(servicios, orquestador, posiciones);
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

    @Bean
    DecisionDeCredito decisionDeCredito(
            ServicioRepositorio servicios,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Orquestador orquestador) {
        return new DecisionDeCredito(servicios, idempotencia, auditoria, tx, orquestador);
    }

    @Bean
    ResolucionDeIntervencion resolucionDeIntervencion(
            ServicioRepositorio servicios,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Orquestador orquestador) {
        return new ResolucionDeIntervencion(servicios, idempotencia, auditoria, tx, orquestador);
    }

    @Bean
    CancelacionDeServicio cancelacionDeServicio(
            ServicioRepositorio servicios,
            ViajeRepositorio viajes,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx) {
        return new CancelacionDeServicio(servicios, viajes, eventos, idempotencia, auditoria, tx);
    }

    @Bean
    ConsultaDeViajes consultaDeViajes(
            ViajeRepositorio viajes,
            ClienteRepositorio clientes,
            RutaRepositorio rutas,
            UltimaPosicionRepositorio posiciones,
            Clock reloj) {
        return new ConsultaDeViajes(viajes, clientes, rutas, posiciones, reloj);
    }

    @Bean
    RegistroDeGps registroDeGps(
            ViajeRepositorio viajes,
            AlmacenGps almacen,
            UltimaPosicionRepositorio posiciones,
            RegistroDeEventos eventos,
            Transacciones tx,
            Clock reloj) {
        return new RegistroDeGps(viajes, almacen, posiciones, eventos, tx, reloj);
    }

    @Bean
    BitacoraDeRuta bitacoraDeRuta(
            ViajeRepositorio viajes,
            ConsultaDeViajes consulta,
            BitacoraRepositorio bitacora,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Transacciones tx,
            Clock reloj) {
        return new BitacoraDeRuta(viajes, consulta, bitacora, eventos, idempotencia, tx, reloj);
    }

    @Bean
    RecorridoDeViaje recorridoDeViaje(ConsultaDeViajes consulta, AlmacenGps almacen) {
        return new RecorridoDeViaje(consulta, almacen);
    }

    @Bean
    DispositivosDelChofer dispositivosDelChofer(DispositivoRepositorio dispositivos, AlmacenGps almacen, Clock reloj) {
        return new DispositivosDelChofer(dispositivos, almacen, reloj);
    }

    @Bean
    InicioDeViaje inicioDeViaje(
            ViajeRepositorio viajes,
            ServicioRepositorio servicios,
            ConsultaDeViajes consulta,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Clock reloj) {
        return new InicioDeViaje(viajes, servicios, consulta, eventos, idempotencia, auditoria, tx, reloj);
    }

    @Bean
    SubidaDeEvidencia subidaDeEvidencia(
            ViajeRepositorio viajes, EvidenciaRepositorio evidencias, AlmacenEvidencias almacen, Transacciones tx) {
        return new SubidaDeEvidencia(viajes, evidencias, almacen, tx);
    }

    @Bean
    EntregaDeViaje entregaDeViaje(
            ViajeRepositorio viajes,
            EntregaRepositorio entregas,
            EvidenciaRepositorio evidencias,
            RutaRepositorio rutas,
            ConsultaDeViajes consulta,
            RegistroDeEventos eventos,
            RegistroIdempotente idempotencia,
            Auditoria auditoria,
            Transacciones tx,
            Clock reloj) {
        return new EntregaDeViaje(
                viajes, entregas, evidencias, rutas, consulta, eventos, idempotencia, auditoria, tx, reloj);
    }

    @Bean
    CierreDeViaje cierreDeViaje(ViajeRepositorio viajes, Inbox inbox, Transacciones tx) {
        return new CierreDeViaje(viajes, inbox, tx);
    }
}
