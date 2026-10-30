/** 30 llamadas por minuto por `sub` y `azp`, en ventana deslizante en memoria (maxInstances = 1, D89). */
export class LimitePeticiones {
  private readonly ventanas = new Map<string, number[]>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs = 60_000,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Devuelve 0 si pasa o los segundos que conviene esperar (Retry-After). */
  tomar(clave: string): number {
    const t = this.ahora();
    const recientes = (this.ventanas.get(clave) ?? []).filter((x) => t - x < this.ventanaMs);
    if (recientes.length >= this.maximo) {
      this.ventanas.set(clave, recientes);
      return Math.max(1, Math.ceil((recientes[0] + this.ventanaMs - t) / 1000));
    }
    recientes.push(t);
    this.ventanas.set(clave, recientes);
    return 0;
  }
}
