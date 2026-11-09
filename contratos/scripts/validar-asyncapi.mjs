// Valida eventos/asyncapi.yaml con el parser oficial, resolviendo los $ref a los esquemas JSON.
import { fileURLToPath } from 'node:url';
import { Parser, fromFile } from '@asyncapi/parser';

const ruta = fileURLToPath(new URL('../eventos/asyncapi.yaml', import.meta.url));
const parser = new Parser();
const { document, diagnostics } = await fromFile(parser, ruta).parse();
const errores = diagnostics.filter((d) => d.severity === 0);
for (const d of diagnostics) {
  const nivel = ['error', 'aviso', 'info', 'pista'][d.severity] ?? d.severity;
  console.log(`${nivel}: ${d.message} (${d.path.join('.')})`);
}
if (!document || errores.length) {
  console.error(`✗ asyncapi.yaml tiene ${errores.length} error(es)`);
  process.exit(1);
}
console.log(`✓ asyncapi.yaml válido: ${document.channels().length} canales, ${document.operations().length} operaciones, ${document.messages().length} mensajes`);
