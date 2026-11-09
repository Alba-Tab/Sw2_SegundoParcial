import { computed, inject, Injectable, signal } from '@angular/core';
import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { CONFIG_CENTRO } from './configuracion';
import { esperaReconexion } from './conexion';

export const ROLES_INTERNOS = ['gerente', 'despachador', 'jefe_flota', 'administracion', 'comercial'];

/** Al volver a la pestaña se renueva como máximo una vez cada 10 s (FK3, spec 016 pasos 5 y 18). */
export const MINIMO_ENTRE_RENOVACIONES_MS = 10_000;

/** Los únicos errores de Keycloak que dicen que la sesión SSO terminó; con red o Keycloak caídos se conserva el token. */
const SESION_TERMINADA = ['invalid_grant', 'login_required'];

interface Reclamos {
  sub?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

export function reclamos(token: string | undefined): Reclamos {
  try {
    const parte = token?.split('.')[1];
    if (!parte) return {};
    const texto = atob(parte.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(texto))) as Reclamos;
  } catch {
    return {};
  }
}

/** `invalid_grant` (sesión cerrada en otra app o vencida) o `login_required`: hay que pedir login. Lo demás es transitorio. */
export function sesionTerminada(error: unknown): boolean {
  const codigo = typeof error === 'object' && error !== null ? (error as { error?: unknown }).error : undefined;
  return typeof codigo === 'string' && SESION_TERMINADA.includes(codigo);
}

/** Devuelve una función que dice si la acción puede correr ahora: como máximo una vez cada `intervaloMs`. */
export function limitador(intervaloMs: number, ahora: () => number = Date.now): () => boolean {
  let ultima = Number.NEGATIVE_INFINITY;
  return () => {
    const t = ahora();
    if (t - ultima < intervaloMs) return false;
    ultima = t;
    return true;
  };
}

/**
 * Sesión OIDC compartida por las 4 apps (spec 016, A y F): Authorization Code + PKCE con el cliente de cada app; el
 * token vive en memoria (D27). Renueva con el refresh token antes de que venza y cada vez que se vuelve a la pestaña;
 * si la sesión de Keycloak se cerró en otra app (`invalid_grant`), borra el token y pide login (FK3). Con la red o
 * Keycloak caídos conserva el token (sirve hasta que vence) y reintenta con espera creciente.
 */
@Injectable({ providedIn: 'root' })
export class Sesion {
  private readonly config = inject(CONFIG_CENTRO);
  private readonly gestor = new UserManager({
    authority: this.config.oidcIssuer,
    client_id: this.config.clienteOidc,
    redirect_uri: `${window.location.origin}/`,
    // Keycloak solo acepta volver a la URL registrada de cada cliente (post.logout.redirect.uris = '+').
    post_logout_redirect_uri: `${window.location.origin}/`,
    scope: 'openid',
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 30,
    monitorSession: false,
  });
  private readonly usuario = signal<User | null>(null);
  private readonly puedeRenovarAlVolver = limitador(MINIMO_ENTRE_RENOVACIONES_MS);
  private enCurso?: Promise<string | undefined>;
  private reintento?: ReturnType<typeof setTimeout>;
  private intentos = 0;
  private saliendo = false;

  readonly token = computed(() => this.usuario()?.access_token);
  readonly roles = computed(() => reclamos(this.token()).realm_access?.roles ?? []);
  readonly nombre = computed(() => {
    const r = reclamos(this.token());
    return r.name ?? r.preferred_username ?? '';
  });
  readonly sub = computed(() => reclamos(this.token()).sub);
  readonly rolesInternos = computed(() => this.roles().filter((r) => ROLES_INTERNOS.includes(r)));

  constructor() {
    this.gestor.events.addUserLoaded((u) => this.usuario.set(u));
    this.gestor.events.addUserUnloaded(() => this.usuario.set(null));
    this.gestor.events.addSilentRenewError((e) => void this.fallo(e));
    // FK3: el cierre de sesión hecho en otra app solo se nota al renovar; por eso se renueva siempre al volver.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.usuario() && this.puedeRenovarAlVolver()) void this.renovar();
    });
  }

  /** Antes de arrancar la app: vuelve de Keycloak o va a buscar la sesión (SSO: sin contraseña si ya existe). */
  async iniciar(): Promise<void> {
    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    if (error) {
      // Keycloak volvió con un error (por ejemplo access_denied): se muestra en vez de volver a redirigir en bucle.
      const detalle = url.searchParams.get('error_description') ?? error;
      await this.gestor.signinRedirectCallback().catch(() => undefined); // borra el state guardado de ese intento
      window.history.replaceState({}, document.title, '/');
      throw new Error(`Keycloak no inició la sesión (${detalle}). Recarga la página para intentarlo de nuevo.`);
    }
    if (url.searchParams.has('code') && url.searchParams.has('state')) {
      const u = await this.gestor.signinRedirectCallback();
      const destino = (u.state as string | undefined) ?? '/';
      window.history.replaceState({}, document.title, destino);
      this.usuario.set(u);
      return;
    }
    await this.gestor.signinRedirect({ state: url.pathname + url.search });
    await new Promise(() => undefined); // el navegador se va a Keycloak
  }

  tiene(...roles: string[]): boolean {
    return this.roles().some((r) => roles.includes(r));
  }

  /** Antes de abrir el WebSocket: renueva si quedan menos de 60 s. */
  async renovarSiHaceFalta(): Promise<void> {
    const u = this.usuario();
    if (!u || (u.expires_in ?? 0) > 60) return;
    await this.renovar();
  }

  /**
   * Renueva con el refresh token. Devuelve el token nuevo, o `undefined` si no se pudo (con la sesión terminada pide
   * login; con un fallo transitorio deja programado otro intento). Las llamadas simultáneas comparten la misma petición.
   */
  renovar(): Promise<string | undefined> {
    this.enCurso ??= this.renovarUnaVez().finally(() => (this.enCurso = undefined));
    return this.enCurso;
  }

  /** CU-21: cierra la sesión SSO de Keycloak (todas las apps la pierden al renovar). */
  async cerrar(): Promise<void> {
    await this.gestor.signoutRedirect({ id_token_hint: this.usuario()?.id_token });
  }

  private async renovarUnaVez(): Promise<string | undefined> {
    if (!this.usuario()?.refresh_token) {
      await this.sesionCerrada();
      return undefined;
    }
    try {
      const u = await this.gestor.signinSilent();
      this.usuario.set(u);
      this.intentos = 0;
      clearTimeout(this.reintento);
      this.reintento = undefined;
      return u?.access_token;
    } catch (e) {
      await this.fallo(e);
      return undefined;
    }
  }

  private async fallo(error: unknown): Promise<void> {
    if (sesionTerminada(error)) return this.sesionCerrada();
    if (this.reintento) return;
    this.reintento = setTimeout(() => {
      this.reintento = undefined;
      void this.renovar();
    }, esperaReconexion(this.intentos++));
  }

  private async sesionCerrada(): Promise<void> {
    if (this.saliendo) return;
    this.saliendo = true;
    clearTimeout(this.reintento);
    await this.gestor.removeUser();
    await this.gestor.signinRedirect({ state: window.location.pathname + window.location.search });
  }
}
