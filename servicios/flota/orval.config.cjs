/**
 * Contrato primero (§15.2, D49): esquemas zod de contratos/openapi/flota.yaml para validar en los controladores y
 * tipar con z.infer. El archivo generado se versiona porque la imagen de Flota se construye sin contratos/;
 * la CI regenera y falla si no coincide (npm run generar:contratos:verificar).
 */
module.exports = {
  flota: {
    input: { target: '../../contratos/openapi/flota.yaml', parserOptions: { externalRefs: { allow: ['./comun.yaml'] } } },
    output: {
      client: 'zod',
      mode: 'single',
      target: 'src/infraestructura/http/contrato/flota.zod.ts',
      // Los parámetros de consulta llegan como texto (?limite=100): se convierten a número antes de validar.
      override: { zod: { generate: { param: true, query: true, header: true, body: true, response: true }, coerce: { query: ['number'] } } },
    },
  },
};
