import { entorno } from '../../src/infraestructura/configuracion/entorno';
import { opcionesAmqp } from '../../src/infraestructura/mensajeria/conexion-amqp';

const leer = (ruta: string): Buffer => Buffer.from(`pem de ${ruta}`);

describe('AMQPS hacia RabbitMQ (B2)', () => {
  it('sin AMQP_CA conecta con las opciones por defecto (compose local)', () => {
    expect(opcionesAmqp(entorno({}), leer)).toBeUndefined();
  });

  it('con AMQP_CA confía en la CA propia', () => {
    expect(opcionesAmqp(entorno({ AMQP_CA: '/s/ca.pem' }), leer)).toEqual({ ca: [leer('/s/ca.pem')] });
  });
});
