import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject } from 'rxjs';
import { Alertas, codigoCierre } from './alertas';
import { CONFIG_CENTRO, type ConfigCentro } from './configuracion';
import { AlertasNuevasGQL, AlertasPendientesGQL, AtenderAlertaGQL, type AlertaCamposFragment } from './graphql/generado';
import { Sesion } from './sesion';

const alerta = (alertaId: string): AlertaCamposFragment => ({
  alertaId,
  secuencia: 1,
  tipo: 'RIESGO_RETRASO',
  severidad: 'ALTA',
  titulo: `Alerta ${alertaId}`,
  detalle: '',
  entidad: { tipo: 'VIAJE', id: 'v1' },
  enlace: '/cc-operaciones/viajes/v1',
  estado: 'ABIERTA',
  creadaEn: '2026-10-30T12:00:00Z',
  origen: 'ANALITICA',
});

const pagina = (alertas: AlertaCamposFragment[], cursor: string) => ({
  data: { alertasPendientes: { alertas, siguienteCursor: cursor, abiertas: alertas.length, datosAl: null } },
});

type Resultado = { data?: { alertas: AlertaCamposFragment }; error?: unknown };

describe('Alertas (campana)', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let subscribe: ReturnType<typeof vi.fn>;
  let renovar: ReturnType<typeof vi.fn>;
  let flujos: Subject<Resultado>[];

  beforeEach(() => {
    vi.useFakeTimers();
    flujos = [];
    fetch = vi
      .fn()
      .mockReturnValueOnce(of(pagina([alerta('a1')], 'c1')))
      .mockReturnValue(of(pagina([alerta('a2')], 'c2')));
    subscribe = vi.fn(() => {
      const flujo = new Subject<Resultado>();
      flujos.push(flujo);
      return flujo as Observable<Resultado>;
    });
    renovar = vi.fn(async () => 'token-nuevo');
    TestBed.configureTestingModule({
      providers: [
        { provide: CONFIG_CENTRO, useValue: { app: 'cc-tablero', urls: {} } as unknown as ConfigCentro },
        { provide: AlertasPendientesGQL, useValue: { fetch } },
        { provide: AlertasNuevasGQL, useValue: { subscribe } },
        { provide: AtenderAlertaGQL, useValue: {} },
        { provide: Sesion, useValue: { renovar } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('lee el código de cierre que Apollo deja en el mensaje', () => {
    expect(codigoCierre(new Error('Socket closed with event 4401 Token vencido'))).toBe(4401);
    expect(codigoCierre(new Error('otra cosa'))).toBeUndefined();
    expect(codigoCierre(undefined)).toBeUndefined();
  });

  it('cuando el Gateway cierra con 4401, renueva el token, pide lo pendiente desde el cursor y se vuelve a suscribir', async () => {
    const alertas = TestBed.inject(Alertas);
    await alertas.iniciar();
    expect(fetch).toHaveBeenCalledWith({ variables: { desde: null } });
    expect(subscribe).toHaveBeenCalledTimes(1);

    // Apollo 4 entrega el cierre fatal como un resultado con error y completa la suscripción.
    flujos[0].next({ error: new Error('Socket closed with event 4401 Token vencido') });
    flujos[0].complete();
    expect(alertas.disponible()).toBe(false);
    expect(renovar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000); // D99: primer reintento a 1 s
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenLastCalledWith({ variables: { desde: 'c1' } });
    expect(subscribe).toHaveBeenCalledTimes(2);

    flujos[1].next({ data: { alertas: alerta('a3') } });
    expect(alertas.lista().map((a) => a.alertaId)).toEqual(['a3', 'a2', 'a1']);
    expect(alertas.disponible()).toBe(true);
  });

  it('espera 1, 2, 4… s entre reintentos seguidos', async () => {
    const alertas = TestBed.inject(Alertas);
    await alertas.iniciar();
    flujos[0].next({ error: new Error('Socket closed with event 4401') });
    await vi.advanceTimersByTimeAsync(1000);
    flujos[1].next({ error: new Error('Socket closed with event 4401') });
    await vi.advanceTimersByTimeAsync(1999);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(subscribe).toHaveBeenCalledTimes(3);
  });

  it('con 4403 (rol sin alertas) no reintenta', async () => {
    const alertas = TestBed.inject(Alertas);
    await alertas.iniciar();
    flujos[0].next({ error: new Error('Socket closed with event 4403 Forbidden') });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(renovar).not.toHaveBeenCalled();
  });
});
