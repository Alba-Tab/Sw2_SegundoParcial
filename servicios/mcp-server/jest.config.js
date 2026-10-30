/** jose 6 es solo ESM: Node lo carga con require(esm), pero Jest necesita transformarlo (igual que en Flota). */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testTimeout: 20000,
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: { allowJs: true } }] },
  transformIgnorePatterns: ['node_modules/(?!(jose|@modelcontextprotocol)/)'],
};
