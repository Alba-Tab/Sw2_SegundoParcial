/** D94: como máximo 15 s; el audio se decodifica a 16 kHz mono para Whisper y nunca sale del navegador. */
export const MAXIMO_MS = 15_000;

const soltar = (flujo?: MediaStream) => flujo?.getTracks().forEach((t) => t.stop());

/**
 * Micrófono de "mantén pulsado para hablar". Cada `empezar` o `cancelar` invalida lo anterior: si se suelta el botón
 * antes de que el navegador entregue el micrófono, ese flujo se cierra apenas llega, y una segunda pulsación nunca deja
 * abierto el micrófono de la primera.
 */
export class Grabadora {
  private grabador?: MediaRecorder;
  private flujo?: MediaStream;
  private trozos: Blob[] = [];
  private corte?: ReturnType<typeof setTimeout>;
  private turno = 0;

  get grabando(): boolean {
    return !!this.grabador;
  }

  /** Devuelve `false` si se canceló (o empezó otra) mientras se esperaba el permiso del micrófono. */
  async empezar(alCortar: () => void): Promise<boolean> {
    this.cancelar();
    const turno = this.turno;
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (turno !== this.turno) {
      soltar(flujo);
      return false;
    }
    this.flujo = flujo;
    this.trozos = [];
    this.grabador = new MediaRecorder(flujo);
    this.grabador.ondataavailable = (e) => this.trozos.push(e.data);
    this.grabador.start();
    this.corte = setTimeout(alCortar, MAXIMO_MS);
    return true;
  }

  /** Cierra el micrófono sin transcribir; también corta un `empezar` que todavía espera el permiso. */
  cancelar(): void {
    this.turno++;
    clearTimeout(this.corte);
    if (this.grabador && this.grabador.state !== 'inactive') this.grabador.stop();
    soltar(this.flujo);
    this.grabador = undefined;
    this.flujo = undefined;
  }

  async terminar(): Promise<Float32Array> {
    clearTimeout(this.corte);
    this.turno++;
    const grabador = this.grabador;
    const flujo = this.flujo;
    this.grabador = undefined;
    this.flujo = undefined;
    if (!grabador) return new Float32Array();
    const listo = grabador.state === 'inactive' ? Promise.resolve() : new Promise<void>((ok) => (grabador.onstop = () => ok()));
    if (grabador.state !== 'inactive') grabador.stop();
    soltar(flujo);
    await listo;
    if (!this.trozos.length) return new Float32Array();
    const datos = await new Blob(this.trozos).arrayBuffer();
    const contexto = new AudioContext({ sampleRate: 16_000 });
    try {
      return (await contexto.decodeAudioData(datos)).getChannelData(0);
    } finally {
      await contexto.close();
    }
  }
}
