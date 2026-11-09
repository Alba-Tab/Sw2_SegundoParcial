import { ListarCargasCombustibleQueryParams, ListarUnidadesQueryParams } from '../../src/infraestructura/http/contrato/flota.zod';

/** Los parámetros de consulta llegan como texto (`?limite=100`): el Gateway los manda así (spec 016). */
describe('parámetros de consulta', () => {
  it('convierte limite a número y sigue validando el rango', () => {
    expect(ListarUnidadesQueryParams.parse({ limite: '100', placa: '4521KTR' })).toMatchObject({ limite: 100, placa: '4521KTR' });
    expect(ListarUnidadesQueryParams.parse({})).toMatchObject({ limite: 20 });
    expect(ListarUnidadesQueryParams.safeParse({ limite: '101' }).success).toBe(false);
    expect(ListarUnidadesQueryParams.safeParse({ limite: 'mil' }).success).toBe(false);
    expect(ListarCargasCombustibleQueryParams.parse({ limite: '5' })).toMatchObject({ limite: 5 });
  });
});
