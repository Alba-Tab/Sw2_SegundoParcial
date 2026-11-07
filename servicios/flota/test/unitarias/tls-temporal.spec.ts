import { entorno } from '../../src/infraestructura/configuracion/entorno';
import { tlsTemporal } from '../../src/infraestructura/temporal/trabajador-temporal';

const leer = (ruta: string): Buffer => Buffer.from(`pem de ${ruta}`);

describe('mTLS hacia Temporal (B1)', () => {
  it('sin variables no arma TLS (compose local)', () => {
    expect(tlsTemporal(entorno({}), leer)).toBeUndefined();
  });

  it('con CA, certificado y clave arma TLS con el par del cliente', () => {
    const e = entorno({ TEMPORAL_TLS_CA: '/s/ca.pem', TEMPORAL_TLS_CERT: '/s/c.pem', TEMPORAL_TLS_KEY: '/s/c.key' });
    expect(tlsTemporal(e, leer)).toEqual({
      serverRootCACertificate: leer('/s/ca.pem'),
      clientCertPair: { crt: leer('/s/c.pem'), key: leer('/s/c.key') },
    });
  });

  it('con solo la CA arma TLS sin certificado de cliente', () => {
    expect(tlsTemporal(entorno({ TEMPORAL_TLS_CA: '/s/ca.pem' }), leer)?.clientCertPair).toBeUndefined();
  });
});
