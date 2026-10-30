import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * D49: servicios tipados de Apollo Angular generados desde contratos/graphql/centro-control.graphql y las operaciones
 * de cada proyecto (*.graphql). `npm run generar` regenera; la CI falla si lo versionado no coincide.
 */
const comun = {
  plugins: ['typescript-operations', 'typescript-apollo-angular'],
  config: {
    scalars: { Fecha: 'string', Instante: 'string', Dinero: 'string', Cursor: 'string', JSON: 'any' },
    enumsAsTypes: true,
    avoidOptionals: false,
    addExplicitOverride: true,
    serviceProvidedInRoot: true,
  },
};
const proyectos = ['ui-comun', 'cc-tablero', 'cc-operaciones', 'cc-flota', 'cc-finanzas'];

const config: CodegenConfig = {
  schema: '../../contratos/graphql/centro-control.graphql',
  generates: Object.fromEntries(
    proyectos.map((p) => [
      `projects/${p}/src/${p === 'ui-comun' ? 'lib' : 'app'}/graphql/generado.ts`,
      { documents: [`projects/${p}/src/**/*.graphql`], ...comun },
    ]),
  ),
  hooks: { afterAllFileWrite: ['prettier --write'] },
  ignoreNoDocuments: true,
};
export default config;
