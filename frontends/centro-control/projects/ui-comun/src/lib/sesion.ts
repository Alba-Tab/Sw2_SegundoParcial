import { computed, inject, Injectable, signal } from '@angular/core';
import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { CONFIG_CENTRO } from './configuracion';

export const ROLES_INTERNOS = ['gerente', 'despachador', 'jefe_flota', 'administracion', 'comercial'];

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

/**
 * Sesión OIDC compartida por las 4 apps (spec 016, A y F): Authorization Code + PKCE con el cliente de cada app; el
 * token vive en memoria (D27). Renueva con el refresh token antes de que venza y al volver a la pestaña; si la sesión
 * de Keycloak se cerró en otra app (`invalid_grant`), borra el token y pide login (FK3).
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
    this.gestor.events.addSilentRenewError(() => void this.sesionCerrada());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.renovarSiHaceFalta();
    });
  }

  /** Antes de arrancar la app: vuelve de Keycloak o va a buscar la sesión (SSO: sin contraseña si ya existe). */
  async iniciar(): Promise<void> {
    const url = new URL(window.location.href);
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

  /** Al volver a la pestaña (spec 016, paso 5): renueva si quedan menos de 60 s. */
  async renovarSiHaceFalta(): Promise<void> {
    const u = this.usuario();
    if (!u || (u.expires_in ?? 0) > 60) return;
    await this.renovar();
  }

  async renovar(): Promise<string | undefined> {
    try {
      const u = await this.gestor.signinSilent();
      this.usuario.set(u);
      return u?.access_token;
    } catch {
      await this.sesionCerrada();
      return undefined;
    }
  }

  /** CU-21: cierra la sesión SSO de Keycloak (todas las apps la pierden al renovar). */
  async cerrar(): Promise<void> {
    await this.gestor.signoutRedirect({ id_token_hint: this.usuario()?.id_token });
  }

  private async sesionCerrada(): Promise<void> {
    await this.gestor.removeUser();
    await this.gestor.signinRedirect({ state: window.location.pathname + window.location.search });
  }
}
