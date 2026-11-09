import { Injectable } from '@nestjs/common';
import type { Reloj } from '../../aplicacion/puertos/reloj';

@Injectable()
export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }

  hoy(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
  }
}
