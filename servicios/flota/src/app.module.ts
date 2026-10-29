import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ComunModule } from './infraestructura/comun.module';
import { AutenticacionMiddleware } from './infraestructura/http/autenticacion.middleware';
import { CorrelacionMiddleware } from './infraestructura/http/correlacion.middleware';
import { FiltroProblemas } from './infraestructura/http/filtro-problemas';
import { SaludController } from './infraestructura/http/salud.controller';

/** API HTTP de Flota (Cloud Run service). */
@Module({
  imports: [ComunModule],
  controllers: [SaludController],
  providers: [
    { provide: APP_FILTER, useClass: FiltroProblemas },
  ],
})
export class AppModule implements NestModule {
  configure(consumidor: MiddlewareConsumer) {
    consumidor.apply(CorrelacionMiddleware).forRoutes('*');
    consumidor.apply(AutenticacionMiddleware).forRoutes('api/*path');
  }
}
