import { destinoActual } from './useSesion';

const CLAVE = 'portal-reentrada';
/** Si la sesión vuelve a fallar enseguida (por ejemplo, un servicio rechaza todo token), no se redirige en ciclo. */
const PAUSA_MS = 30_000;

let enCurso = false;

function ultimaReentrada(): number {
  try {
    return Number(sessionStorage.getItem(CLAVE) ?? 0);
  } catch {
    return 0;
  }
}

function anotarReentrada(ahora: number) {
  try {
    sessionStorage.setItem(CLAVE, String(ahora));
  } catch {
    // Sin sessionStorage no hay protección contra el ciclo, pero la reentrada funciona igual.
  }
}

/**
 * La sesión ya no sirve (Keycloak rechazó el refresh token o la API respondió 401): react-oidc-context calcula
 * `isAuthenticated` solo al cargar, así que se olvida el usuario y se vuelve a Keycloak con la página actual como `state`.
 * Con la sesión SSO viva vuelve sin pedir clave; si no, pide iniciar sesión y luego regresa a la misma página.
 * Varias peticiones con 401 a la vez disparan una sola reentrada, y no se redirige dos veces en 30 s: queda la bienvenida.
 */
export async function volverAEntrar(
  quitarUsuario: () => Promise<void>,
  redirigir: (destino: string) => Promise<unknown>,
  ahora = Date.now(),
): Promise<void> {
  if (enCurso) return;
  enCurso = true;
  try {
    const destino = destinoActual();
    await quitarUsuario();
    if (ahora - ultimaReentrada() < PAUSA_MS) return;
    anotarReentrada(ahora);
    await redirigir(destino);
  } finally {
    enCurso = false;
  }
}
