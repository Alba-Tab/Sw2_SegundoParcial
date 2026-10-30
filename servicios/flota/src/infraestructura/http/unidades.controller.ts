import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { z } from 'zod';
import { ConsultarChoferes } from '../../aplicacion/consulta/consultar-choferes';
import { ConsultarUnidades } from '../../aplicacion/consulta/consultar-unidades';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { Usuario } from './autenticacion.middleware';
import {
  ListarChoferesQueryParams,
  ListarUnidadesQueryParams,
  type ListarChoferesResponse,
  type ListarUnidadesResponse,
  type ObtenerChoferResponse,
  type ObtenerUnidadResponse,
} from './contrato/flota.zod';

type ConUsuario = { usuario: Usuario };

/** Cursor opaco (000 §4): el último id de la página en base64url. */
const aCursor = (id: string) => Buffer.from(id).toString('base64url');
const desdeCursor = (c?: string) => (c ? Buffer.from(c, 'base64url').toString('utf8') : undefined);

function pagina<T extends { [k: string]: unknown }>(items: T[], limite: number, id: (x: T) => string) {
  const visibles = items.slice(0, limite);
  return { items: visibles, siguienteCursor: items.length > limite ? aCursor(id(visibles[visibles.length - 1])) : null };
}

function consulta<S extends z.ZodTypeAny>(esquema: S, q: unknown): z.infer<S> {
  const r = esquema.safeParse(q);
  if (!r.success) throw new ErrorDeDominio('VALIDACION', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

/** Lectura de unidades y choferes (spec 010) para el Centro de Control y el agente. */
@Controller('api/v1')
export class UnidadesController {
  constructor(
    @Inject(ConsultarUnidades) private readonly unidades: ConsultarUnidades,
    @Inject(ConsultarChoferes) private readonly choferes: ConsultarChoferes,
  ) {}

  @Get('unidades')
  async listarUnidades(@Req() req: ConUsuario, @Query() q: unknown): Promise<z.infer<typeof ListarUnidadesResponse>> {
    const p = consulta(ListarUnidadesQueryParams, q);
    const limite = p.limite ?? 20;
    const items = await this.unidades.listar(
      req.usuario.roles,
      { placa: p.placa, tipo: p.tipo, estado: p.estado },
      desdeCursor(p.cursor),
      limite + 1,
    );
    return pagina(items as never[], limite, (u: { unidadId: string }) => u.unidadId) as z.infer<typeof ListarUnidadesResponse>;
  }

  @Get('unidades/:unidadId')
  async obtenerUnidad(@Req() req: ConUsuario, @Param('unidadId') id: string): Promise<z.infer<typeof ObtenerUnidadResponse>> {
    return (await this.unidades.porId(req.usuario.roles, id)) as z.infer<typeof ObtenerUnidadResponse>;
  }

  @Get('choferes')
  async listarChoferes(@Req() req: ConUsuario, @Query() q: unknown): Promise<z.infer<typeof ListarChoferesResponse>> {
    const p = consulta(ListarChoferesQueryParams, q);
    const limite = p.limite ?? 20;
    const items = await this.choferes.listar(req.usuario.roles, { activo: p.activo }, desdeCursor(p.cursor), limite + 1);
    return pagina(items as never[], limite, (c: { choferId: string }) => c.choferId) as z.infer<typeof ListarChoferesResponse>;
  }

  @Get('choferes/:choferId')
  async obtenerChofer(@Req() req: ConUsuario, @Param('choferId') id: string): Promise<z.infer<typeof ObtenerChoferResponse>> {
    const { versionAgregado: _v, ...c } = (await this.choferes.porId(req.usuario, id)) as { versionAgregado?: number };
    return c as z.infer<typeof ObtenerChoferResponse>;
  }
}
