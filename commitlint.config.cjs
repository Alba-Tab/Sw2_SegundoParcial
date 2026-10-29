/**
 * Conventional Commits con los tipos y piezas de AGENTS.md, y sin coautoría ni firmas de asistentes.
 * Corre en el hook commit-msg (lefthook) y en ci-ok sobre los commits del PR.
 */
const PIEZAS = [
  'viajes', 'flota', 'finanzas', 'analitica', 'gateway', 'mcp-server', 'cc-tablero', 'cc-operaciones', 'cc-flota',
  'cc-finanzas', 'ui-comun', 'portal-cliente', 'app-chofer', 'design-tokens', 'intercambio-token', 'contratos',
  'plataforma', 'specs', 'ci', 'repo',
];
const FIRMAS = /^(co-authored-by|signed-off-by):.*(claude|anthropic|copilot|codex|openai|gpt)|generated with/im;

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'sin-coautoria': ({ raw }) => [!FIRMAS.test(raw ?? ''), 'sin Co-Authored-By, Signed-off-by de un asistente ni "Generated with" (AGENTS.md)'],
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'ci', 'perf', 'build']],
    'scope-enum': [2, 'always', PIEZAS],
    'scope-empty': [2, 'never'],
    'subject-case': [0],
    'body-max-line-length': [0],
    'sin-coautoria': [2, 'always'],
  },
};
