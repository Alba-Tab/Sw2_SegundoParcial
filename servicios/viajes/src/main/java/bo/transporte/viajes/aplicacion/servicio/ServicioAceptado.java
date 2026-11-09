package bo.transporte.viajes.aplicacion.servicio;

import java.util.UUID;

/** Respuesta 202 de POST /servicios; también es la respuesta guardada para los reenvíos. */
public record ServicioAceptado(UUID servicioId, UUID viajeId, String estado) {}
