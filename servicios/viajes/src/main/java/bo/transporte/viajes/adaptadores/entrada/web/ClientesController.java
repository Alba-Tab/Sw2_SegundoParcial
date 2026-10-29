package bo.transporte.viajes.adaptadores.entrada.web;

import bo.transporte.viajes.adaptadores.entrada.web.api.ClientesApi;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.CanalServicioDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ClienteDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.ClienteNuevoDto;
import bo.transporte.viajes.adaptadores.entrada.web.api.modelo.PaginaClientesDto;
import bo.transporte.viajes.aplicacion.cliente.AltaDeCliente;
import bo.transporte.viajes.aplicacion.cliente.ClienteVista;
import bo.transporte.viajes.aplicacion.cliente.ConsultaDeClientes;
import bo.transporte.viajes.aplicacion.cliente.VinculacionDeCliente;
import bo.transporte.viajes.dominio.cliente.DatosCliente;
import bo.transporte.viajes.dominio.comun.ErrorDeDominio;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/** Clientes (spec 001). Implementa la interfaz generada desde contratos/openapi/viajes.yaml; los DTO no pasan de aquí. */
@RestController
class ClientesController implements ClientesApi {
    private final AltaDeCliente alta;
    private final VinculacionDeCliente vinculacion;
    private final ConsultaDeClientes consulta;
    private final JsonMapper json;

    ClientesController(
            AltaDeCliente alta, VinculacionDeCliente vinculacion, ConsultaDeClientes consulta, JsonMapper json) {
        this.alta = alta;
        this.vinculacion = vinculacion;
        this.consulta = consulta;
        this.json = json;
    }

    @Override
    public ResponseEntity<ClienteDto> crearCliente(UUID clave, ClienteNuevoDto nuevo, UUID correlacion) {
        var datos = new DatosCliente(
                nuevo.getRazonSocial(), nuevo.getNit(), nuevo.getCorreo(), nuevo.getTelefono(), nuevo.getDireccion());
        var r = alta.ejecutar(SolicitanteActual.obtener(), datos, clave, HashCuerpo.de(json, nuevo));
        return ResponseEntity.status(r.codigoHttp())
                .location(URI.create("/api/v1/clientes/" + r.cliente().clienteId()))
                .body(dto(r.cliente()));
    }

    @Override
    public ResponseEntity<PaginaClientesDto> listarClientes(String q, Integer limite, String cursor) {
        var pagina = consulta.listar(SolicitanteActual.obtener(), q, desdeCursor(cursor), limite == null ? 20 : limite);
        return ResponseEntity.ok(new PaginaClientesDto(
                pagina.items().stream().map(ClientesController::dto).toList(),
                pagina.ultimo() == null ? null : aCursor(pagina.ultimo())));
    }

    @Override
    public ResponseEntity<ClienteDto> obtenerMiCliente() {
        return ResponseEntity.ok(dto(consulta.mio(SolicitanteActual.obtener())));
    }

    @Override
    public ResponseEntity<ClienteDto> obtenerCliente(UUID clienteId) {
        return ResponseEntity.ok(dto(consulta.porId(SolicitanteActual.obtener(), clienteId)));
    }

    @Override
    public ResponseEntity<ClienteDto> reintentarVinculacion(UUID clave) {
        return ResponseEntity.ok(dto(vinculacion.reintentar(SolicitanteActual.obtener())));
    }

    static ClienteDto dto(ClienteVista v) {
        return new ClienteDto(
                        v.razonSocial(),
                        v.nit(),
                        v.correo(),
                        v.telefono(),
                        v.direccion(),
                        v.clienteId(),
                        CanalServicioDto.fromValue(v.canal()),
                        v.tieneCuenta(),
                        v.vinculado(),
                        v.creadoEn().atOffset(ZoneOffset.UTC))
                .creadoPor(v.creadoPor());
    }

    /** Cursor opaco (000 §4): el último clienteId de la página, en base64url. */
    private static String aCursor(UUID ultimo) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(ultimo.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static UUID desdeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        try {
            return UUID.fromString(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            throw new ErrorDeDominio("VALIDACION", "cursor: valor inválido", java.util.Map.of("campo", "cursor"));
        }
    }
}
