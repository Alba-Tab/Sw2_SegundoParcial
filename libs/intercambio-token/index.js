'use strict';
/**
 * Intercambio de tokens RFC 8693 con Keycloak (T9.2, propuesta 7.3, spec 016 paso 7). Sin dependencias: CommonJS para
 * que lo usen igual el Gateway (NestJS) y el servidor MCP.
 *
 * Nunca reenvía el token del usuario: por cada servicio pide uno nuevo a nombre del mismo usuario con la audiencia de
 * ese servicio, y lo guarda en memoria por `sub` y audiencia hasta 30 s antes de que venza.
 */

const TIPO_ACCESS = 'urn:ietf:params:oauth:token-type:access_token';

class ErrorIntercambio extends Error {
  constructor(codigo, mensaje, status) {
    super(mensaje);
    this.name = 'ErrorIntercambio';
    this.codigo = codigo;
    this.status = status;
  }
}

function payload(token) {
  const partes = String(token).split('.');
  if (partes.length !== 3) throw new ErrorIntercambio('NO_AUTENTICADO', 'El token no es un JWT', 401);
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    throw new ErrorIntercambio('NO_AUTENTICADO', 'El token no es un JWT', 401);
  }
}

class IntercambioToken {
  constructor(config) {
    if (!config || !config.issuer || !config.clienteId || !config.clienteSecreto) {
      throw new Error('IntercambioToken necesita issuer, clienteId y clienteSecreto');
    }
    this.url = `${config.issuer.replace(/\/$/, '')}/protocol/openid-connect/token`;
    this.clienteId = config.clienteId;
    this.clienteSecreto = config.clienteSecreto;
    this.margenMs = (config.margenSegundos ?? 30) * 1000;
    this.tiempoEsperaMs = config.tiempoEsperaMs ?? 5000;
    this.fetch = config.fetch ?? globalThis.fetch;
    this.ahora = config.ahora ?? Date.now;
    /** @type {Map<string, {token: string, venceMs: number}>} */
    this.cache = new Map();
    /** @type {Map<string, Promise<string>>} pedidos en curso: dos consultas iguales esperan el mismo intercambio */
    this.enCurso = new Map();
  }

  get tamanoCache() {
    return this.cache.size;
  }

  async tokenPara(tokenUsuario, audiencia) {
    const { sub, exp } = payload(tokenUsuario);
    if (!sub) throw new ErrorIntercambio('NO_AUTENTICADO', 'El token no trae sub', 401);
    // La clave incluye el vencimiento del token recibido: un token nuevo del mismo usuario (otra sesión) no reutiliza
    // uno intercambiado a partir de una sesión que ya se cerró.
    const clave = `${sub}|${audiencia}|${exp ?? ''}`;
    return this.conCache(clave, () =>
      this.pedir({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: tokenUsuario,
        subject_token_type: TIPO_ACCESS,
        requested_token_type: TIPO_ACCESS,
        audience: audiencia,
        scope: `aud-${audiencia}`,
      }),
    );
  }

  async tokenDeServicio(audiencia) {
    const cuerpo = { grant_type: 'client_credentials' };
    if (audiencia) cuerpo.scope = `aud-${audiencia}`;
    return this.conCache(`servicio|${audiencia ?? ''}`, () => this.pedir(cuerpo));
  }

  async conCache(clave, pedir) {
    const guardado = this.cache.get(clave);
    if (guardado && guardado.venceMs - this.margenMs > this.ahora()) return guardado.token;
    const enCurso = this.enCurso.get(clave);
    if (enCurso) return enCurso;
    const promesa = pedir()
      .then(({ token, expiraEnSegundos }) => {
        this.cache.set(clave, { token, venceMs: this.ahora() + expiraEnSegundos * 1000 });
        this.purgar();
        return token;
      })
      .finally(() => this.enCurso.delete(clave));
    this.enCurso.set(clave, promesa);
    return promesa;
  }

  purgar() {
    const ahora = this.ahora();
    for (const [clave, { venceMs }] of this.cache) if (venceMs <= ahora) this.cache.delete(clave);
  }

  async pedir(campos) {
    const cuerpo = new URLSearchParams({ ...campos, client_id: this.clienteId, client_secret: this.clienteSecreto });
    let respuesta;
    try {
      respuesta = await this.fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpo,
        signal: AbortSignal.timeout(this.tiempoEsperaMs),
      });
    } catch (e) {
      throw new ErrorIntercambio('DEPENDENCIA_NO_DISPONIBLE', `Keycloak no responde: ${e.message}`, 503);
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok && datos.access_token) {
      return { token: datos.access_token, expiraEnSegundos: Number(datos.expires_in ?? 60) };
    }
    if (respuesta.status >= 500) {
      throw new ErrorIntercambio('DEPENDENCIA_NO_DISPONIBLE', `Keycloak respondió ${respuesta.status}`, 503);
    }
    // invalid_grant / invalid_token: el token del usuario venció o la sesión se cerró → el usuario debe renovar.
    if (datos.error === 'invalid_grant' || datos.error === 'invalid_token') {
      throw new ErrorIntercambio('NO_AUTENTICADO', datos.error_description ?? 'El token del usuario ya no es válido', 401);
    }
    throw new ErrorIntercambio('SIN_PERMISO', datos.error_description ?? datos.error ?? 'Intercambio rechazado', 403);
  }
}

module.exports = { IntercambioToken, ErrorIntercambio, payload };
