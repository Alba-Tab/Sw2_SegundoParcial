import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { type Sesion, SesionVencida, SinRed } from '../aplicacion/puertos';
import { configuracion } from '../configuracion';

WebBrowser.maybeCompleteAuthSession();

const CLAVE_REFRESH = 'sesion.refresh';
/** Se renueva si al access token (5 min) le quedan menos de 30 s. */
const MARGEN_MS = 30_000;

/** Endpoints de Keycloak armados desde el issuer: renovar no necesita leer la configuración por red. */
const descubrimiento: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${configuracion.oidcIssuer}/protocol/openid-connect/auth`,
  tokenEndpoint: `${configuracion.oidcIssuer}/protocol/openid-connect/token`,
  revocationEndpoint: `${configuracion.oidcIssuer}/protocol/openid-connect/revoke`,
  endSessionEndpoint: `${configuracion.oidcIssuer}/protocol/openid-connect/logout`,
};

/**
 * Sesión del chofer (D27): PKCE con el cliente público `app-chofer` y `offline_access`. El refresh token *offline*
 * sobrevive sin red y vive en el almacenamiento seguro; el access token (5 min) solo en memoria.
 */
export class SesionKeycloak implements Sesion {
  private acceso: { token: string; venceEn: number } | null = null;

  async iniciar(): Promise<boolean> {
    const pedido = new AuthSession.AuthRequest({
      clientId: configuracion.clienteOidc,
      redirectUri: configuracion.redireccion,
      scopes: ['openid', 'offline_access'],
      usePKCE: true,
    });
    const r = await pedido.promptAsync(descubrimiento);
    if (r.type !== 'success') return false;
    const t = await AuthSession.exchangeCodeAsync(
      {
        clientId: configuracion.clienteOidc,
        code: r.params.code,
        redirectUri: configuracion.redireccion,
        extraParams: { code_verifier: pedido.codeVerifier ?? '' },
      },
      descubrimiento,
    );
    await this.guardar(t);
    return true;
  }

  async haySesion(): Promise<boolean> {
    return (await SecureStore.getItemAsync(CLAVE_REFRESH)) !== null;
  }

  async tokenVigente(): Promise<string> {
    if (this.acceso && this.acceso.venceEn - Date.now() > MARGEN_MS) return this.acceso.token;
    const refresh = await SecureStore.getItemAsync(CLAVE_REFRESH);
    if (!refresh) throw new SesionVencida();
    try {
      const t = await AuthSession.refreshAsync({ clientId: configuracion.clienteOidc, refreshToken: refresh }, descubrimiento);
      await this.guardar(t);
      return t.accessToken;
    } catch (e) {
      // invalid_grant: la sesión se cerró o venció (D27). La cola no se toca: se envía después de volver a entrar.
      if (e instanceof AuthSession.TokenError && e.code === 'invalid_grant') {
        await this.olvidar();
        throw new SesionVencida();
      }
      throw new SinRed();
    }
  }

  /** El nombre del chofer, del access token vigente (sin validar la firma: eso lo hacen los servicios). */
  nombre(): string | null {
    if (!this.acceso) return null;
    try {
      const datos = JSON.parse(atob(this.acceso.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
        name?: string;
        preferred_username?: string;
      };
      return datos.name ?? datos.preferred_username ?? null;
    } catch {
      return null;
    }
  }

  async cerrar(): Promise<void> {
    await this.olvidar();
  }

  private async guardar(t: AuthSession.TokenResponse) {
    this.acceso = { token: t.accessToken, venceEn: Date.now() + (t.expiresIn ?? 300) * 1000 };
    if (t.refreshToken) await SecureStore.setItemAsync(CLAVE_REFRESH, t.refreshToken);
  }

  private async olvidar() {
    this.acceso = null;
    await SecureStore.deleteItemAsync(CLAVE_REFRESH);
  }
}
