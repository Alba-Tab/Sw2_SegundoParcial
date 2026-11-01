import { Body, Controller, Headers, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { z } from 'zod';
import type { ChoferVersionado } from '../../aplicacion/chofer/actualizar-chofer';
import { CambiarHabilitacionChofer } from '../../aplicacion/chofer/cambiar-habilitacion-chofer';
import { EditarChofer } from '../../aplicacion/chofer/editar-chofer';
import {
  CambiarHabilitacionChoferBody,
  EditarChoferBody,
  type CambiarHabilitacionChoferResponse,
  type EditarChoferResponse,
} from './contrato/flota.zod';
import { hashPeticion, type PeticionHttp } from './hash-cuerpo';
import { claveObligatoria, textoRecortado, validar } from './validar';

const EdicionChofer = EditarChoferBody.extend({ nombre: textoRecortado(3, 120) });
const Habilitacion = CambiarHabilitacionChoferBody.extend({ motivo: textoRecortado(3, 200).optional() });

/** `versionAgregado` es interno (ChoferActualizado, 000 §6): no está en el contrato del chofer. */
const sinVersion = ({ versionAgregado: _v, ...c }: ChoferVersionado) => c;

/** Edición y habilitación de choferes (D104; solo jefe_flota). Sin alta: el chofer llega de Keycloak y la semilla. */
@Controller('api/v1/choferes')
export class GestionChoferesController {
  constructor(
    @Inject(EditarChofer) private readonly editar: EditarChofer,
    @Inject(CambiarHabilitacionChofer) private readonly habilitacion: CambiarHabilitacionChofer,
  ) {}

  @Put(':choferId')
  async editarChofer(
    @Req() req: PeticionHttp,
    @Param('choferId') choferId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof EditarChoferResponse>> {
    const e = validar(EdicionChofer, cuerpo);
    const c = await this.editar.ejecutar(choferId, {
      usuario: req.usuario,
      clave: claveObligatoria(clave),
      hashCuerpo: hashPeticion(req, e),
      cuerpo: e,
    });
    return sinVersion(c);
  }

  @Post(':choferId/habilitacion')
  @HttpCode(200)
  async cambiarHabilitacion(
    @Req() req: PeticionHttp,
    @Param('choferId') choferId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Body() cuerpo: unknown,
  ): Promise<z.infer<typeof CambiarHabilitacionChoferResponse>> {
    const e = validar(Habilitacion, cuerpo);
    const c = await this.habilitacion.ejecutar(choferId, {
      usuario: req.usuario,
      clave: claveObligatoria(clave),
      hashCuerpo: hashPeticion(req, e),
      cuerpo: e,
    });
    return sinVersion(c);
  }
}
