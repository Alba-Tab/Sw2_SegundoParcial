import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { z } from 'zod';
import { ConsultarCombustible } from '../../aplicacion/combustible/consultar-combustible';
import { RegistrarCarga } from '../../aplicacion/combustible/registrar-carga';
import type { Usuario } from './autenticacion.middleware';
import {
  ListarCargasCombustibleQueryParams,
  ListarLecturasCombustibleQueryParams,
  RegistrarCargaCombustibleBody,
  type ListarCargasCombustibleResponse,
  type ListarLecturasCombustibleResponse,
  type RegistrarCargaCombustibleResponse,
} from './contrato/flota.zod';
import { hashCuerpo } from './hash-cuerpo';
import { claveObligatoria, validar } from './validar';

type ConUsuario = { usuario: Usuario };

/** Combustible (spec 009): cargas del chofer y lecturas del sensor. */
@Controller('api/v1')
export class CombustibleController {
  constructor(
    @Inject(RegistrarCarga) private readonly registrar: RegistrarCarga,
    @Inject(ConsultarCombustible) private readonly consultar: ConsultarCombustible,
  ) {}

  @Post('cargas-combustible')
  @HttpCode(201)
  async registrarCarga(
    @Req() req: ConUsuario,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof RegistrarCargaCombustibleResponse>> {
    const e = validar(RegistrarCargaCombustibleBody, cuerpo);
    return (await this.registrar.ejecutar(req.usuario, claveObligatoria(clave), e, hashCuerpo(e))) as z.infer<
      typeof RegistrarCargaCombustibleResponse
    >;
  }

  @Get('cargas-combustible')
  async listarCargas(@Req() req: ConUsuario, @Query() q: unknown): Promise<z.infer<typeof ListarCargasCombustibleResponse>> {
    const p = validar(ListarCargasCombustibleQueryParams, q);
    const limite = p.limite ?? 20;
    const despuesDe = p.cursor ? Buffer.from(p.cursor, 'base64url').toString('utf8') : undefined;
    const items = await this.consultar.cargas(req.usuario, { tractoId: p.tractoId, desde: p.desde, hasta: p.hasta }, despuesDe, limite + 1);
    const visibles = items.slice(0, limite);
    return {
      items: visibles,
      siguienteCursor: items.length > limite ? Buffer.from(visibles[visibles.length - 1].cargaId).toString('base64url') : null,
    } as z.infer<typeof ListarCargasCombustibleResponse>;
  }

  @Get('unidades/:unidadId/lecturas-combustible')
  async lecturas(
    @Req() req: ConUsuario,
    @Param('unidadId') unidadId: string,
    @Query() q: unknown,
  ): Promise<z.infer<typeof ListarLecturasCombustibleResponse>> {
    const p = validar(ListarLecturasCombustibleQueryParams, q);
    return (await this.consultar.lecturas(req.usuario.roles, unidadId, p.desde, p.hasta)) as z.infer<
      typeof ListarLecturasCombustibleResponse
    >;
  }
}
