import { describe, expect, it } from 'vitest';
import { reclamosDe } from './useSesion';

const token = (payload: object) => `e30.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.firma`;

describe('reclamosDe', () => {
  it('lee clienteId y los roles del access token (con tildes en el nombre)', () => {
    const r = reclamosDe(token({ sub: 's', name: 'Ñandú', clienteId: 'c1', realm_access: { roles: ['cliente'] } }).replace(/^e30/, 'e30'));
    expect(r.clienteId).toBe('c1');
    expect(r.realm_access?.roles).toEqual(['cliente']);
  });

  it('un token ilegible no rompe la sesión', () => {
    expect(reclamosDe('no-es-un-jwt')).toEqual({});
    expect(reclamosDe(undefined)).toEqual({});
  });
});
