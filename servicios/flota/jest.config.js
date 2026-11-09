/**
 * Unitarias rápidas y de integración con Testcontainers (Mongo rs0 y RabbitMQ).
 * jose 6 es solo ESM: Node lo carga con require(esm), pero Jest necesita transformarlo.
 */
const base = {
  testEnvironment: 'node',
  rootDir: '.',
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: { allowJs: true } }] },
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
module.exports = {
  projects: [
    { ...base, displayName: 'unitarias', testMatch: ['<rootDir>/test/unitarias/**/*.spec.ts'] },
    { ...base, displayName: 'integracion', testMatch: ['<rootDir>/test/integracion/**/*.spec.ts'] },
  ],
};
