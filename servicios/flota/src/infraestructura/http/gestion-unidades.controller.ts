import { Body, Controller, Headers, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { z } from 'zod';
import { ProgramarMantenimiento } from '../../aplicacion/mantenimiento/programar-mantenimiento';
import { ActualizarUnidad } from '../../aplicacion/unidad/actualizar-unidad';
import { CrearUnidad } from '../../aplicacion/unidad/crear-unidad';
import { DarDeBajaUnidad } from '../../aplicacion/unidad/dar-de-baja-unidad';
import { ErrorDeDominio } from '../../dominio/comun/error-de-dominio';
import type { Usuario } from './autenticacion.middleware';
import {
  ActualizarUnidadBody,
  CrearUnidadBody,
  DarDeBajaUnidadBody,
  ProgramarMantenimientoBody,
  type ActualizarUnidadResponse,
  type CrearUnidadResponse,
  type DarDeBajaUnidadResponse,
  type ProgramarMantenimientoResponse,
} from './contrato/flota.zod';
import { hashCuerpo } from './hash-cuerpo';
import { claveObligatoria, validar } from './validar';

type ConUsuario = { usuario: Usuario };

/** Spec 010, paso 2: esos campos solo cambian por viajes, cargas y mantenimientos. */
const NO_EDITABLES = ['estado', 'placa', 'kilometraje', 'kmDesdeUltimoMantenimiento'];

/** Alta, edición, baja y mantenimiento de unidades (spec 010; solo jefe_flota). */
@Controller('api/v1/unidades')
export class GestionUnidadesController {
  constructor(
    @Inject(CrearUnidad) private readonly crear: CrearUnidad,
    @Inject(ActualizarUnidad) private readonly actualizar: ActualizarUnidad,
    @Inject(DarDeBajaUnidad) private readonly baja: DarDeBajaUnidad,
    @Inject(ProgramarMantenimiento) private readonly programar: ProgramarMantenimiento,
  ) {}

  @Post()
  @HttpCode(201)
  async crearUnidad(
    @Req() req: ConUsuario,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof CrearUnidadResponse>> {
    const e = validar(CrearUnidadBody, cuerpo);
    const u = await this.crear.ejecutar({ usuario: req.usuario, clave: claveObligatoria(clave), hashCuerpo: hashCuerpo(e), cuerpo: e });
    return u as z.infer<typeof CrearUnidadResponse>;
  }

  @Put(':unidadId')
  async actualizarUnidad(
    @Req() req: ConUsuario,
    @Param('unidadId') unidadId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof ActualizarUnidadResponse>> {
    const fijo = NO_EDITABLES.find((c) => cuerpo !== null && typeof cuerpo === 'object' && c in cuerpo);
    if (fijo) throw new ErrorDeDominio('VALIDACION', `${fijo}: no se edita`, { campo: fijo });
    const e = validar(ActualizarUnidadBody, cuerpo);
    const u = await this.actualizar.ejecutar(unidadId, {
      usuario: req.usuario,
      clave: claveObligatoria(clave),
      hashCuerpo: hashCuerpo(e),
      cuerpo: e,
    });
    return u as z.infer<typeof ActualizarUnidadResponse>;
  }

  @Post(':unidadId/baja')
  @HttpCode(200)
  async darDeBaja(
    @Req() req: ConUsuario,
    @Param('unidadId') unidadId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof DarDeBajaUnidadResponse>> {
    const e = validar(DarDeBajaUnidadBody, cuerpo);
    const u = await this.baja.ejecutar(unidadId, {
      usuario: req.usuario,
      clave: claveObligatoria(clave),
      hashCuerpo: hashCuerpo(e),
      cuerpo: e,
    });
    return u as z.infer<typeof DarDeBajaUnidadResponse>;
  }

  @Post(':unidadId/mantenimientos')
  @HttpCode(201)
  async programarMantenimiento(
    @Req() req: ConUsuario,
    @Param('unidadId') unidadId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof ProgramarMantenimientoResponse>> {
    const e = validar(ProgramarMantenimientoBody, cuerpo);
    const m = await this.programar.ejecutar(unidadId, {
      usuario: req.usuario,
      clave: claveObligatoria(clave),
      hashCuerpo: hashCuerpo(e),
      cuerpo: e,
    });
    return m as z.infer<typeof ProgramarMantenimientoResponse>;
  }
}
