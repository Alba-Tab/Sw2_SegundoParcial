import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConsultarChoferes } from './aplicacion/consulta/consultar-choferes';
import { ConsultarUnidades } from './aplicacion/consulta/consultar-unidades';
import { CHOFER_REPOSITORIO, type ChoferRepositorio } from './aplicacion/puertos/chofer-repositorio';
import { UNIDAD_REPOSITORIO, type UnidadRepositorio } from './aplicacion/puertos/unidad-repositorio';
import { ComunModule } from './infraestructura/comun.module';
import { AutenticacionMiddleware } from './infraestructura/http/autenticacion.middleware';
import { CorrelacionMiddleware } from './infraestructura/http/correlacion.middleware';
import { FiltroProblemas } from './infraestructura/http/filtro-problemas';
import { SaludController } from './infraestructura/http/salud.controller';
import { UnidadesController } from './infraestructura/http/unidades.controller';

/** API HTTP de Flota (Cloud Run service). */
@Module({
  imports: [ComunModule],
  controllers: [SaludController, UnidadesController],
  providers: [
    { provide: APP_FILTER, useClass: FiltroProblemas },
    { provide: ConsultarUnidades, inject: [UNIDAD_REPOSITORIO], useFactory: (u: UnidadRepositorio) => new ConsultarUnidades(u) },
    { provide: ConsultarChoferes, inject: [CHOFER_REPOSITORIO], useFactory: (c: ChoferRepositorio) => new ConsultarChoferes(c) },
  ],
})
export class AppModule implements NestModule {
  configure(consumidor: MiddlewareConsumer) {
    consumidor.apply(CorrelacionMiddleware).forRoutes('*');
    consumidor.apply(AutenticacionMiddleware).forRoutes('api/*path');
  }
}
