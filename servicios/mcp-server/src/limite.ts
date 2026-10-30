/**
 * 30 llamadas a herramientas por minuto por `sub` y `azp`, en ventana deslizante en memoria (maxInstances = 1, D89).
 * Las claves sin llamadas en la ventana se borran: el Map no crece con cada `sub` que pasó alguna vez.
 */
export class LimitePeticiones {
  private readonly ventanas = new Map<string, number[]>();
  private ultimaPurga = 0;

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs = 60_000,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Claves guardadas (para pruebas y métricas). */
  get tamano(): number {
    return this.ventanas.size;
  }

  /** Devuelve 0 si pasa o los segundos que conviene esperar (Retry-After). */
  tomar(clave: string): number {
    const t = this.ahora();
    this.purgar(t);
    const recientes = (this.ventanas.get(clave) ?? []).filter((x) => t - x < this.ventanaMs);
    if (recientes.length >= this.maximo) {
      this.ventanas.set(clave, recientes);
      return Math.max(1, Math.ceil((recientes[0] + this.ventanaMs - t) / 1000));
    }
    recientes.push(t);
    this.ventanas.set(clave, recientes);
    return 0;
  }

  /** Como mucho una vez por ventana: borra las claves cuya última llamada ya salió de la ventana. */
  private purgar(t: number) {
    if (t - this.ultimaPurga < this.ventanaMs) return;
    this.ultimaPurga = t;
    for (const [clave, marcas] of this.ventanas)
      if (!marcas.length || t - marcas[marcas.length - 1] >= this.ventanaMs) this.ventanas.delete(clave);
  }
}
