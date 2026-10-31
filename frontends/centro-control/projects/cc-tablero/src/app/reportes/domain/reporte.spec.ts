import { mensajeDisparo, urlTraza } from '../../agente/domain/mision';
import { mensajePregunta, mostrarCatalogo, preguntaValida } from '../../voz/domain/voz';
import { paramsLimpios, paramsPorDefecto, usaParametro } from './reporte';

describe('cc-tablero (dominio)', () => {
  const ahora = new Date('2026-10-30T15:00:00Z'); // 30/10 en La Paz

  it('cada reporte abre con sus parámetros por defecto', () => {
    expect(paramsPorDefecto('CUENTAS_POR_COBRAR', ahora)).toEqual({ desde: '2026-10-30', hasta: '2026-11-05' });
    expect(paramsPorDefecto('VIAJES_EN_RIESGO', ahora)).toEqual({ umbral: 0.7 });
    expect(paramsPorDefecto('RENTABILIDAD', ahora)).toEqual({ desde: '2026-09-30', hasta: '2026-10-30', agrupar: 'RUTA' });
    expect(paramsPorDefecto('CONSUMO_COMBUSTIBLE', ahora)).toEqual({ desde: '2026-09-30', hasta: '2026-10-30' });
  });

  it('quita los parámetros vacíos y lee el esquema de cada reporte', () => {
    expect(paramsLimpios({ desde: '2026-10-01', clienteId: undefined, placa: '' })).toEqual({ desde: '2026-10-01' });
    expect(usaParametro({ properties: { placa: {} } }, 'placa')).toBe(true);
    expect(usaParametro(undefined, 'placa')).toBe(false);
  });

  it('spec 014: la traza enlaza a Jaeger solo si está configurado', () => {
    expect(urlTraza('http://localhost:16686/', 'abc')).toBe('http://localhost:16686/trace/abc');
    expect(urlTraza(undefined, 'abc')).toBeNull();
    expect(mensajeDisparo('CONFLICTO_ESTADO', 'x')).toBe('Ya hay una misión en curso');
  });

  it('spec 015: los avisos de la pregunta se deciden por el código', () => {
    expect(preguntaValida(' ab ')).toBe(false);
    expect(mensajePregunta('LLM_NO_DISPONIBLE', 'x')).toBe('El asistente no está disponible');
    expect(mensajePregunta(undefined, 'otro')).toBe('otro');
    expect(mostrarCatalogo('PREGUNTA_FUERA_DE_ALCANCE')).toBe(true);
    expect(mostrarCatalogo('SIN_PERMISO')).toBe(false);
  });
});
