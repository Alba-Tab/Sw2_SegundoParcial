/** Un paso de las migas de pan: el último es la página actual y no lleva ruta. */
export interface Miga {
  texto: string;
  ruta?: string;
}

/** A dónde lleva "volver": la última miga con ruta antes de la página actual (la lista padre). */
export function migaPadre(migas: readonly Miga[]): Miga | undefined {
  return migas
    .slice(0, -1)
    .reverse()
    .find((m) => m.ruta);
}

/** La consola de administración del realm (decisión G8): `<base>/realms/<realm>` pasa a `<base>/admin/<realm>/console/`. */
export function urlAdminKeycloak(issuer: string): string | undefined {
  const m = /^(.*)\/realms\/([^/?#]+)\/?$/.exec(issuer);
  return m ? `${m[1]}/admin/${m[2]}/console/` : undefined;
}

/** Agrega `desde=<app>` a un enlace hacia otra app, para que la de destino ofrezca "Volver a <app>". */
export function conDesde(url: string, app: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}desde=${encodeURIComponent(app)}`;
}
