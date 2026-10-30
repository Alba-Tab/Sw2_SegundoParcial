import type { CasosDeUso } from './casosDeUso';
import type { Cola, DatosDelChofer, PuntosGps, SesionCerrable, TareasDeFondo } from './puertos';

export interface SinEnviar {
  operaciones: number;
  puntos: number;
}

/**
 * "Cerrar sesión" (spec 005). A diferencia de la sesión vencida (`invalid_grant`, que no toca la cola), el chofer sale a
 * propósito: se detiene el GPS de fondo, se quita el token push de su registro, se revoca el refresh token *offline* en
 * Keycloak y se borra lo que dejó en el celular, para que otro chofer en el mismo equipo no vea sus viajes ni su cola.
 * Si queda algo sin enviar, la pantalla pide confirmación antes (`sinEnviar`).
 */
export class CierreSesion {
  constructor(
    private readonly cola: Cola,
    private readonly puntos: PuntosGps,
    private readonly datos: DatosDelChofer,
    private readonly sesion: SesionCerrable,
    private readonly fondo: TareasDeFondo,
    private readonly casos: Pick<CasosDeUso, 'registrarDispositivo' | 'olvidar'>,
  ) {}

  /** Lo que se perdería al salir: operaciones de la cola y puntos GPS que todavía no llegaron al servidor. */
  sinEnviar(): SinEnviar {
    return { operaciones: this.cola.todas().length, puntos: this.puntos.contar() };
  }

  async salir(): Promise<void> {
    // Primero el GPS: que ninguna lectura se guarde después de borrar.
    await this.fondo.detener().catch(() => {});
    // PUT /dispositivos/mio sin tokenPush (reemplazo completo): los avisos de este chofer dejan de llegar aquí. Sin
    // señal no se puede; el siguiente chofer que entre registra el suyo.
    await this.casos.registrarDispositivo(null).catch(() => {});
    await this.sesion.cerrar();
    this.datos.borrar();
    this.casos.olvidar();
  }
}
