import { buildSchema, parse, validate } from 'graphql';
import { limiteProfundidad } from '../src/graphql/limites';
import { sumar } from '../src/graphql/mapeos';

describe('límites (D101)', () => {
  const esquema = buildSchema('type Nodo { hijo: Nodo, nombre: String } type Query { raiz: Nodo }');
  const consulta = (n: number) => `{ raiz ${'{ hijo '.repeat(n - 1)}{ nombre }${' }'.repeat(n - 1)} }`;

  it('profundidad 8 pasa y 12 no, también escondida en fragmentos', () => {
    expect(validate(esquema, parse(consulta(7)), [limiteProfundidad()])).toHaveLength(0);
    const errores = validate(esquema, parse(consulta(12)), [limiteProfundidad()]);
    expect(errores[0].extensions['codigo']).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    const fragmentos = parse(
      '{ raiz { ...a } } fragment a on Nodo { hijo { hijo { hijo { hijo { hijo { hijo { hijo { hijo { nombre } } } } } } } } }',
    );
    expect(validate(esquema, fragmentos, [limiteProfundidad()])).toHaveLength(1);
  });
});

describe('dinero', () => {
  it('suma en centavos, sin float', () => {
    expect(sumar(['7600.00', '2800.00', null, '0.10', '0.20'])).toBe('10400.30');
    expect(sumar([])).toBe('0.00');
  });
});
