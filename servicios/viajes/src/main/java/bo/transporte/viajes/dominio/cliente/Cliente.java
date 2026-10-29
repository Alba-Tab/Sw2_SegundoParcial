package bo.transporte.viajes.dominio.cliente;

import bo.transporte.viajes.dominio.comun.CanalServicio;
import bo.transporte.viajes.dominio.comun.Uuid7;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Agregado Cliente (spec 001). Viajes es su dueño y el único que escribe {@code clienteId} en Keycloak.
 * Un cliente del portal tiene cuenta ({@code sub}); uno registrado por comercial no ({@code canal = TELEFONO}).
 * {@code vinculado} solo puede ser true si tiene cuenta. {@code versionAgregado} ordena las copias en los consumidores.
 */
public final class Cliente {
    private final UUID clienteId;
    private final String sub;
    private final DatosCliente datos;
    private final CanalServicio canal;
    private final String creadoPor;
    private final Instant creadoEn;
    private final int versionAgregado;
    private final boolean activo;
    private boolean vinculado;

    private Cliente(
            UUID clienteId,
            String sub,
            DatosCliente datos,
            CanalServicio canal,
            String creadoPor,
            Instant creadoEn,
            int versionAgregado,
            boolean activo,
            boolean vinculado) {
        this.clienteId = Objects.requireNonNull(clienteId);
        this.sub = sub;
        this.datos = Objects.requireNonNull(datos);
        this.canal = Objects.requireNonNull(canal);
        this.creadoPor = creadoPor;
        this.creadoEn = Objects.requireNonNull(creadoEn);
        this.versionAgregado = versionAgregado;
        this.activo = activo;
        this.vinculado = vinculado && sub != null;
    }

    /** Alta desde el portal: el usuario autenticado sin roles registra su empresa. */
    public static Cliente delPortal(String sub, DatosCliente datos, Instant ahora) {
        Objects.requireNonNull(sub, "sub");
        return new Cliente(Uuid7.nuevo(), sub, datos, CanalServicio.PORTAL, sub, ahora, 1, true, false);
    }

    /** Alta por atención comercial: cliente sin cuenta, sin paso de Keycloak. */
    public static Cliente deComercial(String subComercial, DatosCliente datos, Instant ahora) {
        return new Cliente(Uuid7.nuevo(), null, datos, CanalServicio.TELEFONO, subComercial, ahora, 1, true, false);
    }

    public static Cliente reconstruir(
            UUID clienteId,
            String sub,
            DatosCliente datos,
            CanalServicio canal,
            String creadoPor,
            Instant creadoEn,
            int versionAgregado,
            boolean activo,
            boolean vinculado) {
        return new Cliente(clienteId, sub, datos, canal, creadoPor, creadoEn, versionAgregado, activo, vinculado);
    }

    public void marcarVinculado() {
        if (sub == null) throw new IllegalStateException("Un cliente sin cuenta no se vincula en Keycloak");
        vinculado = true;
    }

    public boolean tieneCuenta() {
        return sub != null;
    }

    public UUID clienteId() {
        return clienteId;
    }

    public String sub() {
        return sub;
    }

    public DatosCliente datos() {
        return datos;
    }

    public CanalServicio canal() {
        return canal;
    }

    public String creadoPor() {
        return creadoPor;
    }

    public Instant creadoEn() {
        return creadoEn;
    }

    public int versionAgregado() {
        return versionAgregado;
    }

    public boolean activo() {
        return activo;
    }

    public boolean vinculado() {
        return vinculado;
    }
}
