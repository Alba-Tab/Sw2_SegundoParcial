package bo.transporte.viajes.aplicacion.cliente;

import bo.transporte.viajes.dominio.cliente.Cliente;
import java.time.Instant;
import java.util.UUID;

/** El cliente con la forma de contratos/openapi/viajes.yaml#/components/schemas/Cliente (también se guarda como respuesta idempotente). */
public record ClienteVista(
        UUID clienteId,
        String razonSocial,
        String nit,
        String correo,
        String telefono,
        String direccion,
        String canal,
        boolean tieneCuenta,
        boolean vinculado,
        String creadoPor,
        Instant creadoEn) {

    public static ClienteVista de(Cliente c) {
        var d = c.datos();
        return new ClienteVista(
                c.clienteId(),
                d.razonSocial(),
                d.nit(),
                d.correo(),
                d.telefono(),
                d.direccion(),
                c.canal().name(),
                c.tieneCuenta(),
                c.vinculado(),
                c.creadoPor(),
                c.creadoEn());
    }

    public ClienteVista vinculadoA(boolean valor) {
        return new ClienteVista(
                clienteId,
                razonSocial,
                nit,
                correo,
                telefono,
                direccion,
                canal,
                tieneCuenta,
                valor,
                creadoPor,
                creadoEn);
    }
}
