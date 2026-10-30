import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConsultarCombustible } from './aplicacion/combustible/consultar-combustible';
import { RegistrarCarga } from './aplicacion/combustible/registrar-carga';
import { ConsultarChoferes } from './aplicacion/consulta/consultar-choferes';
import { ConsultarUnidades } from './aplicacion/consulta/consultar-unidades';
import { CHOFER_REPOSITORIO, type ChoferRepositorio } from './aplicacion/puertos/chofer-repositorio';
import { COMBUSTIBLE_REPOSITORIO, type CombustibleRepositorio } from './aplicacion/puertos/combustible-repositorio';
import { REGISTRO_DE_EVENTOS, type RegistroDeEventos } from './aplicacion/puertos/registro-de-eventos';
import { RELOJ, type Reloj } from './aplicacion/puertos/reloj';
import { RESERVA_UNIDAD_REPOSITORIO, type ReservaUnidadRepositorio } from './aplicacion/puertos/reserva-unidad-repositorio';
import { UNIDAD_DE_TRABAJO, type UnidadDeTrabajo } from './aplicacion/puertos/unidad-de-trabajo';
import { UNIDAD_REPOSITORIO, type UnidadRepositorio } from './aplicacion/puertos/unidad-repositorio';
import { CombustibleController } from './infraestructura/http/combustible.controller';
import { ComunModule } from './infraestructura/comun.module';
import { AutenticacionMiddleware } from './infraestructura/http/autenticacion.middleware';
import { CorrelacionMiddleware } from './infraestructura/http/correlacion.middleware';
import { FiltroProblemas } from './infraestructura/http/filtro-problemas';
import { SaludController } from './infraestructura/http/salud.controller';
import { UnidadesController } from './infraestructura/http/unidades.controller';

/** API HTTP de Flota (Cloud Run service). */
@Module({
  imports: [ComunModule],
  controllers: [SaludController, UnidadesController, CombustibleController],
  providers: [
    { provide: APP_FILTER, useClass: FiltroProblemas },
    { provide: ConsultarUnidades, inject: [UNIDAD_REPOSITORIO], useFactory: (u: UnidadRepositorio) => new ConsultarUnidades(u) },
    { provide: ConsultarChoferes, inject: [CHOFER_REPOSITORIO], useFactory: (c: ChoferRepositorio) => new ConsultarChoferes(c) },
    {
      provide: RegistrarCarga,
      inject: [
        UNIDAD_DE_TRABAJO,
        COMBUSTIBLE_REPOSITORIO,
        RESERVA_UNIDAD_REPOSITORIO,
        UNIDAD_REPOSITORIO,
        CHOFER_REPOSITORIO,
        REGISTRO_DE_EVENTOS,
        RELOJ,
      ],
      useFactory: (
        tx: UnidadDeTrabajo,
        k: CombustibleRepositorio,
        r: ReservaUnidadRepositorio,
        u: UnidadRepositorio,
        c: ChoferRepositorio,
        e: RegistroDeEventos,
        reloj: Reloj,
      ) => new RegistrarCarga(tx, k, r, u, c, e, reloj),
    },
    {
      provide: ConsultarCombustible,
      inject: [COMBUSTIBLE_REPOSITORIO, UNIDAD_REPOSITORIO, CHOFER_REPOSITORIO],
      useFactory: (k: CombustibleRepositorio, u: UnidadRepositorio, c: ChoferRepositorio) => new ConsultarCombustible(k, u, c),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumidor: MiddlewareConsumer) {
    consumidor.apply(CorrelacionMiddleware).forRoutes('*');
    consumidor.apply(AutenticacionMiddleware).forRoutes('api/*path');
  }
}
