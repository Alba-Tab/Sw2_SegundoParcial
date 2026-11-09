import { Grabadora } from './grabadora';

class FlujoFalso {
  readonly pista = { stop: vi.fn() };
  getTracks() {
    return [this.pista];
  }
}

class GrabadorFalso {
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable?: (e: { data: Blob }) => void;
  onstop?: () => void;
  constructor(readonly stream: FlujoFalso) {}
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

describe('grabadora de voz', () => {
  let pendientes: ((f: FlujoFalso) => void)[];

  beforeEach(() => {
    pendientes = [];
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => new Promise<FlujoFalso>((ok) => pendientes.push(ok)) },
    });
    vi.stubGlobal('MediaRecorder', GrabadorFalso);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('si se suelta antes de que llegue el micrófono, lo cierra apenas llega y no graba', async () => {
    const grabadora = new Grabadora();
    const empezo = grabadora.empezar(() => undefined);
    grabadora.cancelar();
    const flujo = new FlujoFalso();
    pendientes[0](flujo);
    expect(await empezo).toBe(false);
    expect(flujo.pista.stop).toHaveBeenCalled();
    expect(grabadora.grabando).toBe(false);
  });

  it('una segunda pulsación no deja abierto el micrófono de la primera', async () => {
    const grabadora = new Grabadora();
    const primera = grabadora.empezar(() => undefined);
    const segunda = grabadora.empezar(() => undefined);
    const flujo1 = new FlujoFalso();
    const flujo2 = new FlujoFalso();
    pendientes[0](flujo1);
    pendientes[1](flujo2);
    expect(await primera).toBe(false);
    expect(await segunda).toBe(true);
    expect(flujo1.pista.stop).toHaveBeenCalled();
    expect(flujo2.pista.stop).not.toHaveBeenCalled();
    grabadora.cancelar();
    expect(flujo2.pista.stop).toHaveBeenCalled();
  });

  it('terminar sin audio devuelve vacío y suelta el micrófono', async () => {
    const grabadora = new Grabadora();
    const empezo = grabadora.empezar(() => undefined);
    const flujo = new FlujoFalso();
    pendientes[0](flujo);
    expect(await empezo).toBe(true);
    expect((await grabadora.terminar()).length).toBe(0);
    expect(flujo.pista.stop).toHaveBeenCalled();
  });
});
