package bo.transporte.viajes.adaptadores.salida.persistencia;

import bo.transporte.viajes.aplicacion.puerto.salida.ViajeRepositorio;
import bo.transporte.viajes.dominio.comun.Monto;
import bo.transporte.viajes.dominio.comun.TipoCarga;
import bo.transporte.viajes.dominio.viaje.Asignacion;
import bo.transporte.viajes.dominio.viaje.EstadoViaje;
import bo.transporte.viajes.dominio.viaje.Viaje;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class ViajeRepositorioJdbc implements ViajeRepositorio {
    static final String COLUMNAS = "v.viaje_id, v.servicio_id, v.cliente_id, v.cotizacion_id, v.estado, v.motivo,"
            + " v.detalle, v.ruta_id, v.tipo_carga, v.toneladas, v.fecha_viaje, v.monto, v.reserva_unidad_id,"
            + " v.tracto_id, v.remolque_id, v.placa, v.chofer_id, v.chofer_nombre, v.chofer_usuario_sub, v.creado_en";
    private final JdbcClient jdbc;

    ViajeRepositorioJdbc(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean insertarSiNoExiste(Viaje v) {
        return jdbc.sql("""
                        INSERT INTO viaje (viaje_id, servicio_id, cliente_id, cotizacion_id, estado, creado_en, actualizado_en)
                        VALUES (:id, :servicio, :cliente, :cotizacion, :estado, :creadoEn, :creadoEn)
                        ON CONFLICT (viaje_id) DO NOTHING""")
                        .param("id", v.viajeId())
                        .param("servicio", v.servicioId())
                        .param("cliente", v.clienteId())
                        .param("cotizacion", v.cotizacionId())
                        .param("estado", v.estado().name())
                        .param("creadoEn", Timestamp.from(v.creadoEn()))
                        .update()
                == 1;
    }

    @Override
    public Optional<Viaje> paraActualizar(UUID viajeId) {
        return jdbc.sql("SELECT " + COLUMNAS + " FROM viaje v WHERE v.viaje_id = :id FOR UPDATE")
                .param("id", viajeId)
                .query((rs, i) -> viaje(rs))
                .optional();
    }

    @Override
    public void actualizar(Viaje v) {
        var a = v.asignacion();
        jdbc.sql("""
                        UPDATE viaje SET estado = :estado, motivo = :motivo, detalle = :detalle, ruta_id = :ruta,
                               tipo_carga = :tipoCarga, toneladas = :toneladas, fecha_viaje = :fecha, monto = :monto,
                               reserva_unidad_id = :reserva, tracto_id = :tracto, remolque_id = :remolque, placa = :placa,
                               chofer_id = :chofer, chofer_nombre = :choferNombre, chofer_usuario_sub = :choferSub,
                               actualizado_en = :ahora
                        WHERE viaje_id = :id""")
                .param("id", v.viajeId())
                .param("estado", v.estado().name())
                .param("motivo", v.motivo())
                .param("detalle", v.detalle())
                .param("ruta", a == null ? null : a.rutaId())
                .param("tipoCarga", a == null ? null : a.tipoCarga().name())
                .param("toneladas", a == null ? null : a.toneladas())
                .param("fecha", a == null ? null : Date.valueOf(a.fechaViaje()))
                .param("monto", a == null ? null : a.monto().monto())
                .param("reserva", a == null ? null : a.reservaUnidadId())
                .param("tracto", a == null ? null : a.tractoId())
                .param("remolque", a == null ? null : a.remolqueId())
                .param("placa", a == null ? null : a.placa())
                .param("chofer", a == null ? null : a.choferId())
                .param("choferNombre", a == null ? null : a.choferNombre())
                .param("choferSub", a == null ? null : a.choferUsuarioSub())
                .param("ahora", Timestamp.from(Instant.now()))
                .update();
    }

    /** 28.00 → 28 y 20.50 → 20.5, como en el contrato (sin notación científica). */
    private static BigDecimal toneladas(BigDecimal t) {
        var sin = t.stripTrailingZeros();
        return sin.scale() < 0 ? sin.setScale(0) : sin;
    }

    static Viaje viaje(ResultSet rs) throws SQLException {
        Asignacion a = rs.getString("placa") == null
                ? null
                : new Asignacion(
                        rs.getObject("ruta_id", UUID.class),
                        TipoCarga.valueOf(rs.getString("tipo_carga")),
                        toneladas(rs.getBigDecimal("toneladas")),
                        rs.getDate("fecha_viaje").toLocalDate(),
                        new Monto(rs.getBigDecimal("monto"), Monto.BOB),
                        rs.getObject("reserva_unidad_id", UUID.class),
                        rs.getObject("tracto_id", UUID.class),
                        rs.getObject("remolque_id", UUID.class),
                        rs.getString("placa"),
                        rs.getObject("chofer_id", UUID.class),
                        rs.getString("chofer_nombre"),
                        rs.getString("chofer_usuario_sub"));
        return Viaje.reconstruir(
                rs.getObject("viaje_id", UUID.class),
                rs.getObject("servicio_id", UUID.class),
                rs.getObject("cliente_id", UUID.class),
                rs.getObject("cotizacion_id", UUID.class),
                rs.getTimestamp("creado_en").toInstant(),
                EstadoViaje.valueOf(rs.getString("estado")),
                a,
                rs.getString("motivo"),
                rs.getString("detalle"));
    }
}
