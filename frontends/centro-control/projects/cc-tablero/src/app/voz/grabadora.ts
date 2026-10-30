/** D94: como máximo 15 s; el audio se decodifica a 16 kHz mono para Whisper y nunca sale del navegador. */
export const MAXIMO_MS = 15_000;

export class Grabadora {
  private grabador?: MediaRecorder;
  private trozos: Blob[] = [];
  private corte?: ReturnType<typeof setTimeout>;

  async empezar(alCortar: () => void): Promise<void> {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.trozos = [];
    this.grabador = new MediaRecorder(flujo);
    this.grabador.ondataavailable = (e) => this.trozos.push(e.data);
    this.grabador.start();
    this.corte = setTimeout(alCortar, MAXIMO_MS);
  }

  async terminar(): Promise<Float32Array> {
    clearTimeout(this.corte);
    const grabador = this.grabador;
    if (!grabador) return new Float32Array();
    const listo = new Promise<void>((ok) => (grabador.onstop = () => ok()));
    grabador.stop();
    grabador.stream.getTracks().forEach((t) => t.stop());
    await listo;
    const datos = await new Blob(this.trozos).arrayBuffer();
    const contexto = new AudioContext({ sampleRate: 16_000 });
    try {
      return (await contexto.decodeAudioData(datos)).getChannelData(0);
    } finally {
      await contexto.close();
    }
  }
}
