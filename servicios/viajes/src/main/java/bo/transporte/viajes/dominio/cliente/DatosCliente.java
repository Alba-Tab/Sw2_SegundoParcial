package bo.transporte.viajes.dominio.cliente;

import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.util.regex.Pattern;

/** Datos de la empresa (spec 001): razón social 3–120, NIT de 5 a 20 dígitos (no se valida contra el SIN), correo obligatorio. */
public record DatosCliente(String razonSocial, String nit, String correo, String telefono, String direccion) {
    private static final Pattern NIT = Pattern.compile("^[0-9]{5,20}$");
    private static final Pattern CORREO = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    public DatosCliente {
        razonSocial = recortar(razonSocial);
        direccion = recortar(direccion);
        telefono = recortar(telefono);
        correo = recortar(correo);
        exigir(
                razonSocial.length() >= 3 && razonSocial.length() <= 120,
                "razonSocial",
                "Debe tener entre 3 y 120 caracteres");
        exigir(nit != null && NIT.matcher(nit).matches(), "nit", "Debe tener entre 5 y 20 dígitos");
        exigir(CORREO.matcher(correo).matches(), "correo", "Correo inválido");
        exigir(telefono.length() >= 6 && telefono.length() <= 20, "telefono", "Debe tener entre 6 y 20 caracteres");
        exigir(
                direccion.length() >= 3 && direccion.length() <= 200,
                "direccion",
                "Debe tener entre 3 y 200 caracteres");
    }

    private static String recortar(String s) {
        return s == null ? "" : s.strip();
    }

    private static void exigir(boolean ok, String campo, String mensaje) {
        if (!ok) throw new ErrorDeDominio("VALIDACION", campo + ": " + mensaje, java.util.Map.of("campo", campo));
    }
}
