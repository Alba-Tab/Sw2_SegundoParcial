/** Clean (AGENTS.md): dominio y aplicacion no importan NestJS, Mongoose ni infraestructura. */
module.exports = {
  forbidden: [
    {
      name: 'dominio-puro',
      severity: 'error',
      comment: 'El dominio no conoce aplicacion, infraestructura ni frameworks',
      from: { path: '^src/dominio' },
      to: { path: ['^src/(aplicacion|infraestructura)', 'node_modules/(@nestjs|mongoose|mongodb|amqplib|jose|nestjs-pino|@opentelemetry|@temporalio)'] },
    },
    {
      name: 'aplicacion-sin-infraestructura',
      severity: 'error',
      comment: 'Los casos de uso usan puertos y no conocen NestJS; los adaptadores viven en infraestructura',
      from: { path: '^src/aplicacion' },
      to: {
        path: ['^src/infraestructura', 'node_modules/(@nestjs|mongoose|mongodb|amqplib|jose|nestjs-pino|@opentelemetry|@temporalio|express)'],
      },
    },
    { name: 'sin-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'tsconfig.json' } },
};
