/**
 * Del JSON de cada servicio a los tipos del esquema. Solo cambia la forma (por ejemplo `{monto, moneda}` → `Dinero`);
 * el Gateway no tiene reglas de negocio.
 */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const dinero = (m: Json | string | null | undefined): string | null =>
  m === null || m === undefined ? null : typeof m === 'string' ? m : (m['monto'] ?? null);

export function ruta(r: Json): Json {
  return {
    rutaId: r['rutaId'],
    nombre: r['nombre'],
    origen: r['origen']?.['nombre'] ?? r['origen'] ?? '',
    destino: r['destino']?.['nombre'] ?? r['destino'] ?? '',
    distanciaKm: Number(r['distanciaKm'] ?? 0),
  };
}

export function viaje(v: Json): Json {
  return {
    viajeId: v['viajeId'],
    servicioId: v['servicioId'],
    estado: v['estado'],
    motivo: v['motivo'] ?? null,
    cliente: { clienteId: v['cliente']?.['clienteId'], razonSocial: v['cliente']?.['razonSocial'] ?? '' },
    ruta: ruta(v['ruta'] ?? {}),
    tipoCarga: v['tipoCarga'],
    toneladas: Number(v['toneladas']),
    fechaViaje: v['fechaViaje'],
    placa: v['placa'] ?? null,
    choferNombre: v['choferNombre'] ?? null,
    iniciadoEn: v['iniciadoEn'] ?? null,
    ultimaPosicion: v['ultimaPosicion']?.['posicion'] ?? null,
    ultimaPosicionEn: v['ultimaPosicion']?.['registradaEn'] ?? null,
  };
}

export function servicio(s: Json): Json {
  return { ...s, monto: dinero(s['monto']), confirmacionCompleta: Boolean(s['confirmacionCompleta']) };
}

export function factura(f: Json): Json {
  return {
    ...f,
    monto: dinero(f['monto']),
    saldo: dinero(f['saldo']),
    vencida: Boolean(f['vencida']),
    pagos: Array.isArray(f['pagos']) ? f['pagos'].map(pago) : null,
  };
}

export const pago = (p: Json): Json => ({ ...p, monto: dinero(p['monto']) });

export function lineaCredito(l: Json): Json {
  return {
    clienteId: l['clienteId'],
    limite: dinero(l['limite']),
    reservado: dinero(l['reservado']),
    utilizado: dinero(l['utilizado']),
    disponible: dinero(l['disponible']),
    enMora: Boolean(l['enMora']),
  };
}

export const cotizacion = (c: Json): Json => ({ ...c, monto: dinero(c['monto']), vencida: Boolean(c['vencida']) });

export function solicitud(s: Json): Json {
  return {
    ...s,
    monto: dinero(s['monto']),
    facturasVencidas: (s['facturasVencidas'] ?? []).map((f: Json) => ({ ...f, saldo: dinero(f['saldo']) })),
  };
}

export const carga = (c: Json): Json => ({ ...c, monto: dinero(c['monto']) });

export function unidad(u: Json): Json {
  return { ...u, documentos: u['documentos'] ?? [], kmDesdeUltimoMantenimiento: Number(u['kmDesdeUltimoMantenimiento'] ?? 0) };
}

export const mantenimiento = (m: Json): Json => ({ ...m, checklist: m['checklist'] ?? [] });

/**
 * Los elementos de una lista REST: `{items}` en las páginas de Viajes, Flota y Finanzas, o un arreglo plano como el de
 * `listarRutas` (contratos/openapi/viajes.yaml).
 */
export const items = <T = Json>(r: Json | Json[] | undefined): T[] => (Array.isArray(r) ? r : (r?.['items'] ?? [])) as T[];
