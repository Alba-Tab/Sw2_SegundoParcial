import type { RutaFichaFragment, RutaInput, RutasQuery } from '../../graphql/generado';

/** Rutas (G4): lista con activas e inactivas, ficha por id, alta y edición para gerente y despachador. */
export type Ruta = NonNullable<RutasQuery['rutas']>[number];
export type FichaRuta = RutaFichaFragment;

/** Quién crea y edita rutas (Viajes y el Gateway vuelven a validar). */
export const ROLES_GESTION_RUTAS = ['gerente', 'despachador'];

/** Límites de RutaNueva en viajes.yaml (y de RutaActualizada.v1). */
export const LIMITES_RUTA = { radioMin: 50, radioMax: 5000, kmMax: 5000 } as const;

/** Lo que encuentra la búsqueda: nombre, origen y destino. */
export const textoRuta = (r: Ruta): string => [r.nombre, r.origen, r.destino].join(' ');

/** «Inactiva» solo si Viajes lo dice: una ruta sin el dato se muestra como activa, igual que en el catálogo. */
export const textoActiva = (r: { activa?: boolean | null }): string => (r.activa === false ? 'Inactiva' : 'Activa');

/** Los valores del formulario: los números quedan como los da el campo (`number` o null si está vacío). */
export interface ValoresRuta {
  nombre: string;
  origen: string;
  origenLat: number | null;
  origenLng: number | null;
  destino: string;
  destinoLat: number | null;
  destinoLng: number | null;
  radioMetros: number | null;
  distanciaKm: number | null;
  activa: boolean;
}

/** El formulario vacío (alta) o con la ruta que se edita. */
export function valoresIniciales(r?: FichaRuta | null): ValoresRuta {
  return {
    nombre: r?.nombre ?? '',
    origen: r?.origen ?? '',
    origenLat: r?.origenCoordenadas?.lat ?? null,
    origenLng: r?.origenCoordenadas?.lng ?? null,
    destino: r?.destino ?? '',
    destinoLat: r?.destinoCoordenadas?.lat ?? null,
    destinoLng: r?.destinoCoordenadas?.lng ?? null,
    radioMetros: r?.radioMetros ?? 300,
    distanciaKm: r?.distanciaKm ?? null,
    activa: r?.activa ?? true,
  };
}

/** Del formulario ya validado al input de la mutación (sin la clave, que la pone la fachada). */
export function aInputRuta(v: ValoresRuta): Omit<RutaInput, 'claveIdempotencia'> {
  return {
    nombre: v.nombre.trim(),
    origen: { nombre: v.origen.trim(), coordenadas: { lat: Number(v.origenLat), lng: Number(v.origenLng) } },
    destino: {
      nombre: v.destino.trim(),
      coordenadas: { lat: Number(v.destinoLat), lng: Number(v.destinoLng) },
      radioMetros: Number(v.radioMetros),
    },
    distanciaKm: Number(v.distanciaKm),
    activa: v.activa,
  };
}
