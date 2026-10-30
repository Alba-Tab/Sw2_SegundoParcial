'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IntercambioToken, ErrorIntercambio } = require('..');

const jwt = (datos) => `x.${Buffer.from(JSON.stringify(datos)).toString('base64url')}.y`;

function keycloak(respuestas) {
  const pedidos = [];
  const fetch = async (url, opciones) => {
    pedidos.push(Object.fromEntries(new URLSearchParams(opciones.body)));
    const r = respuestas.shift() ?? { status: 200, json: { access_token: `t${pedidos.length}`, expires_in: 300 } };
    if (r instanceof Error) throw r;
    return { ok: r.status < 300, status: r.status, json: async () => r.json };
  };
  return { fetch, pedidos };
}

test('intercambia con audiencia y scope, sin reenviar el token, y guarda en caché por sub y audiencia', async () => {
  let reloj = 1_000_000;
  const kc = keycloak([]);
  const it = new IntercambioToken({ issuer: 'http://kc/realms/transporte/', clienteId: 'gateway', clienteSecreto: 's', fetch: kc.fetch, ahora: () => reloj });
  const usuario = jwt({ sub: 'u1', exp: 99 });
  assert.equal(await it.tokenPara(usuario, 'viajes'), 't1');
  assert.equal(await it.tokenPara(usuario, 'viajes'), 't1');
  assert.equal(await it.tokenPara(usuario, 'flota'), 't2');
  assert.deepEqual(
    { ...kc.pedidos[0], subject_token: '…' },
    {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: '…',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: 'viajes',
      scope: 'aud-viajes',
      client_id: 'gateway',
      client_secret: 's',
    },
  );
  reloj += 271_000; // 30 s antes de vencer (300 s) ya no sirve
  assert.equal(await it.tokenPara(usuario, 'viajes'), 't3');
});

test('dos pedidos simultáneos esperan el mismo intercambio', async () => {
  const kc = keycloak([]);
  const it = new IntercambioToken({ issuer: 'http://kc/r', clienteId: 'g', clienteSecreto: 's', fetch: kc.fetch });
  const u = jwt({ sub: 'u1', exp: 1 });
  const [a, b] = await Promise.all([it.tokenPara(u, 'viajes'), it.tokenPara(u, 'viajes')]);
  assert.equal(a, b);
  assert.equal(kc.pedidos.length, 1);
});

test('errores con el código de 000 §5', async () => {
  const kc = keycloak([
    { status: 400, json: { error: 'invalid_grant' } },
    { status: 403, json: { error: 'access_denied', error_description: 'Client not allowed to exchange' } },
    { status: 502, json: {} },
    new TypeError('fetch failed'),
  ]);
  const it = new IntercambioToken({ issuer: 'http://kc/r', clienteId: 'g', clienteSecreto: 's', fetch: kc.fetch });
  const u = jwt({ sub: 'u1' });
  const codigo = (p) => p.then(() => null, (e) => (assert.ok(e instanceof ErrorIntercambio), `${e.codigo} ${e.status}`));
  assert.equal(await codigo(it.tokenPara(u, 'a')), 'NO_AUTENTICADO 401');
  assert.equal(await codigo(it.tokenPara(u, 'b')), 'SIN_PERMISO 403');
  assert.equal(await codigo(it.tokenPara(u, 'c')), 'DEPENDENCIA_NO_DISPONIBLE 503');
  assert.equal(await codigo(it.tokenPara(u, 'd')), 'DEPENDENCIA_NO_DISPONIBLE 503');
  assert.equal(await codigo(it.tokenPara('no-es-jwt', 'd')), 'NO_AUTENTICADO 401');
});

test('token de servicio por client credentials', async () => {
  const kc = keycloak([]);
  const it = new IntercambioToken({ issuer: 'http://kc/r', clienteId: 'gateway', clienteSecreto: 's', fetch: kc.fetch });
  assert.equal(await it.tokenDeServicio('analitica'), 't1');
  assert.equal(await it.tokenDeServicio('analitica'), 't1');
  assert.deepEqual(kc.pedidos[0], { grant_type: 'client_credentials', scope: 'aud-analitica', client_id: 'gateway', client_secret: 's' });
});
