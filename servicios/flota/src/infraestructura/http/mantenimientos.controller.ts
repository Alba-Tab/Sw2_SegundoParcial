import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { z } from 'zod';
import { CerrarMantenimiento } from '../../aplicacion/mantenimiento/cerrar-mantenimiento';
import { ConsultarMantenimientos } from '../../aplicacion/mantenimiento/consultar-mantenimientos';
import type { Usuario } from './autenticacion.middleware';
import {
  CerrarMantenimientoBody,
  ListarMantenimientosQueryParams,
  type CerrarMantenimientoResponse,
  type ListarMantenimientosResponse,
} from './contrato/flota.zod';
import { hashCuerpo } from './hash-cuerpo';
import { aCursor, claveObligatoria, desdeCursor, validar } from './validar';

type ConUsuario = { usuario: Usuario };

/** Lista y cierre de mantenimientos (spec 010, sección E). */
@Controller('api/v1/mantenimientos')
export class MantenimientosController {
  constructor(
    @Inject(ConsultarMantenimientos) private readonly consultar: ConsultarMantenimientos,
    @Inject(CerrarMantenimiento) private readonly cerrar: CerrarMantenimiento,
  ) {}

  @Get()
  async listar(@Req() req: ConUsuario, @Query() q: unknown): Promise<z.infer<typeof ListarMantenimientosResponse>> {
    const p = validar(ListarMantenimientosQueryParams, q);
    const limite = p.limite ?? 20;
    const items = await this.consultar.listar(
      req.usuario.roles,
      { unidadId: p.unidadId, estado: p.estado },
      desdeCursor(p.cursor),
      limite + 1,
    );
    const visibles = items.slice(0, limite);
    return {
      items: visibles,
      siguienteCursor: items.length > limite ? aCursor(visibles[visibles.length - 1].mantenimientoId) : null,
    } as z.infer<typeof ListarMantenimientosResponse>;
  }

  @Post(':mantenimientoId/cierre')
  @HttpCode(200)
  async cerrarMantenimiento(
    @Req() req: ConUsuario,
    @Param('mantenimientoId') mantenimientoId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof CerrarMantenimientoResponse>> {
    const e = validar(CerrarMantenimientoBody, cuerpo);
    const m = await this.cerrar.ejecutar(mantenimientoId, {
      usuario: req.usuario,
      clave: claveObligatoria(clave),
      hashCuerpo: hashCuerpo(e),
      cuerpo: e,
    });
    return m as z.infer<typeof CerrarMantenimientoResponse>;
  }
}
