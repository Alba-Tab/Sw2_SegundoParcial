import { conclusionLegible, pasoLegible } from './mision';

describe('panel del agente en frases (JV-3)', () => {
  it('cada herramienta se lee como una frase; una desconocida, sin su nombre técnico', () => {
    expect(pasoLegible('obtener_viajes_en_curso')).toBe('Revisó los viajes en curso');
    expect(pasoLegible('proponer_accion')).toBe('Propuso una acción al despachador');
    expect(pasoLegible('herramienta_nueva')).toBe('Usó una herramienta del sistema');
    expect(pasoLegible('toString')).toBe('Usó una herramienta del sistema');
  });

  it('la conclusión solo si la misión terminó bien y dice algo más que «FIN»', () => {
    expect(conclusionLegible('FIN', 'COMPLETADA')).toBeNull();
    expect(conclusionLegible(' fin. ', 'COMPLETADA')).toBeNull();
    expect(conclusionLegible('Propuse avisar al cliente del viaje 2851KTR.', 'COMPLETADA')).toBe(
      'Propuse avisar al cliente del viaje 2851KTR.',
    );
    expect(conclusionLegible('ConnectError: timeout', 'FALLIDA')).toBeNull();
    expect(conclusionLegible(null, 'COMPLETADA')).toBeNull();
  });
});
