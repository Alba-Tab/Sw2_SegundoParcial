import { describe, expect, it } from 'vitest';
import type { Operacion } from '../dominio/operacion';
import { CierreSesion } from './cierreSesion';
import type { Cola, PuntosGps } from './puertos';

const pendiente = (opId: string) => ({ opId, estado: 'PENDIENTE' }) as Operacion;

function armar(o: { pendientes?: number; puntos?: number; fallaGps?: boolean; sinRed?: boolean } = {}) {
  const pasos: string[] = [];
  const cola = { todas: () => Array.from({ length: o.pendientes ?? 0 }, (_, i) => pendiente(`op-${i}`)) } as unknown as Cola;
  const puntos = { contar: () => o.puntos ?? 0 } as unknown as PuntosGps;
  const cierre = new CierreSesion(
    cola,
    puntos,
    { borrar: () => void pasos.push('borrar datos') },
    { cerrar: async () => void pasos.push('revocar y olvidar token') },
    {
      detener: async () => {
        pasos.push('detener GPS');
        if (o.fallaGps) throw new Error('sin permiso');
      },
    },
    {
      registrarDispositivo: async (token) => {
        pasos.push(`registrar dispositivo con token ${token}`);
        if (o.sinRed) throw new Error('Sin conexión');
      },
      olvidar: () => void pasos.push('olvidar memoria'),
    },
  );
  return { cierre, pasos };
}

describe('cerrar sesión (spec 005)', () => {
  it('detiene el GPS, quita el token push, revoca la sesión y borra los datos del chofer, en ese orden', async () => {
    const { cierre, pasos } = armar();
    await cierre.salir();
    expect(pasos).toEqual([
      'detener GPS',
      'registrar dispositivo con token null',
      'revocar y olvidar token',
      'borrar datos',
      'olvidar memoria',
    ]);
  });

  it('sin señal o sin poder detener el GPS, igual cierra la sesión y borra', async () => {
    const { cierre, pasos } = armar({ fallaGps: true, sinRed: true });
    await cierre.salir();
    expect(pasos).toContain('revocar y olvidar token');
    expect(pasos).toContain('borrar datos');
  });

  it('cuenta lo que se perdería al salir, para pedir confirmación', () => {
    expect(armar().cierre.sinEnviar()).toEqual({ operaciones: 0, puntos: 0 });
    expect(armar({ pendientes: 2, puntos: 37 }).cierre.sinEnviar()).toEqual({ operaciones: 2, puntos: 37 });
  });
});
