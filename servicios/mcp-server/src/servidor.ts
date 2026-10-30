import { McpServer } from '@modelcontextprotocol/server';
import type { Llamador } from './autenticacion';
import { argumentosMision, argumentosRedactar, misionVigilarViajes, redactarRespuestaReporte, VOCABULARIO } from './herramientas/catalogo';
import { HERRAMIENTAS, MAX_SALIDA } from './herramientas/herramientas';
import { ClienteServicios, ErrorHerramienta, type Contexto } from './servicios';

export type Auditar = (linea: Record<string, unknown>) => void;

/** Línea JSON de auditoría por llamada (000 §9): el MCP no tiene base, va a los logs (D91). */
export const auditarEnLog: Auditar = (linea) => process.stdout.write(`${JSON.stringify(linea)}\n`);

const error = (codigo: string, mensaje: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ codigo, mensaje }) }],
  structuredContent: { codigo, mensaje },
});

/**
 * Un McpServer por petición (especificación 2026-07-28, sin sesiones): solo se registran las herramientas que permite
 * el rol del token. Así `tools/list` del agente muestra 6, y una oculta responde -32602 sin revelar que existe.
 */
export function crearServidor(
  llamador: Llamador,
  base: Omit<Contexto, 'llamador'>,
  servicios: ClienteServicios,
  auditar: Auditar = auditarEnLog,
) {
  const servidor = new McpServer({ name: 'transporte-mcp', version: '1.0.0' }, { capabilities: { tools: {}, resources: {}, prompts: {} } });
  const ctx: Contexto = { ...base, llamador };
  const rol = llamador.roles.find((r) => ['agente_lectura', 'gerente', 'despachador', 'jefe_flota', 'administracion'].includes(r)) ?? null;

  for (const h of HERRAMIENTAS.filter((h) => h.roles.some((r) => llamador.roles.includes(r)))) {
    servidor.registerTool(
      h.nombre,
      { description: h.descripcion, inputSchema: h.entrada, outputSchema: h.salida },
      async (args: Record<string, unknown>) => {
        const inicio = Date.now();
        let resultado: ReturnType<typeof error> | { content: { type: 'text'; text: string }[]; structuredContent: Record<string, unknown> };
        try {
          const salida = h.salida.parse(await h.ejecutar(args, ctx, servicios)) as Record<string, unknown>;
          const texto = JSON.stringify(salida);
          if (Buffer.byteLength(texto) > MAX_SALIDA) throw new ErrorHerramienta('VALIDACION', 'La salida pasa de 16 KB: acota la consulta');
          resultado = { content: [{ type: 'text', text: texto }], structuredContent: salida };
        } catch (e) {
          resultado =
            e instanceof ErrorHerramienta
              ? error(e.codigo, e.message)
              : error('ERROR_INTERNO', e instanceof Error && e.name === 'ZodError' ? 'Respuesta inesperada del servicio' : 'Error interno');
        }
        auditar({
          ocurridoEn: new Date().toISOString(),
          canal: 'SISTEMA',
          accion: `mcp.${h.nombre}`,
          actorSub: llamador.sub,
          actorRol: rol,
          azp: llamador.azp,
          correlationId: ctx.correlationId,
          datos: h.auditable ? h.auditable(args) : args,
          resultado: 'isError' in resultado ? (resultado.structuredContent as { codigo: string }).codigo : 'OK',
          ms: Date.now() - inicio,
        });
        return resultado;
      },
    );
  }

  servidor.registerResource(
    'vocabulario',
    'vocabulario://negocio',
    { mimeType: 'text/plain', description: 'Vocabulario del negocio' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/plain', text: VOCABULARIO }],
    }),
  );
  servidor.registerResource(
    'reportes',
    'catalogo://reportes',
    { mimeType: 'application/json', description: 'Los 5 reportes, parámetros y roles' },
    async (uri) => {
      const r = await servicios.llamar<Record<string, unknown>>(ctx, 'analitica', 'GET', '/api/v1/reportes');
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(r['reportes']) }] };
    },
  );
  servidor.registerResource(
    'rutas',
    'catalogo://rutas',
    { mimeType: 'application/json', description: 'Rutas activas con destino y distancia' },
    async (uri) => {
      const r = await servicios.llamar<Record<string, unknown>>(ctx, 'viajes', 'GET', '/api/v1/rutas');
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(r['items'] ?? r) }] };
    },
  );

  servidor.registerPrompt(
    'mision_vigilar_viajes',
    { description: 'Misión del agente (spec 014)', argsSchema: argumentosMision },
    async (a) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: misionVigilarViajes(Number(a.umbralRiesgo ?? 0.7), Number(a.maxPasos ?? 8)) },
        },
      ],
    }),
  );
  servidor.registerPrompt(
    'redactar_respuesta_reporte',
    { description: 'Redacción de la respuesta por voz (spec 015)', argsSchema: argumentosRedactar },
    async (a) => ({
      messages: [{ role: 'user', content: { type: 'text', text: redactarRespuestaReporte(a.pregunta, a.reporteId, a.resultado) } }],
    }),
  );
  return servidor;
}
