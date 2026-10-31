import { TestBed } from '@angular/core/testing';
import { ETIQUETAS, etiqueta } from 'ui-comun/dominio';
import esquema from '../../../../../../contratos/graphql/centro-control.graphql' with { loader: 'text' };
import { Estado, EtiquetaPipe } from './estado';

// Enums que no se muestran crudos: tienen su propio texto en la pantalla que los usa.
const SIN_ETIQUETA = ['Periodo', 'ReporteId', 'OpcionIntervencion'];

const enums = [...esquema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)].map(([, nombre, cuerpo]) => ({
  nombre,
  valores: cuerpo.split(/\s+/).filter(Boolean),
}));

describe('etiquetas de los enums', () => {
  it('lee los enums del esquema GraphQL', () => {
    expect(enums.map((x) => x.nombre)).toContain('EstadoViaje');
  });

  it.each(enums.filter((x) => !SIN_ETIQUETA.includes(x.nombre)))('$nombre: todo valor tiene etiqueta', ({ nombre, valores }) => {
    const grupo = (ETIQUETAS as Record<string, Record<string, unknown>>)[nombre];
    expect(grupo, `falta el grupo ${nombre} en ETIQUETAS`).toBeDefined();
    for (const v of valores) expect(grupo[v], `${nombre}.${v}`).toBeDefined();
  });

  it('un valor desconocido sale legible y neutro, nunca crudo', () => {
    expect(etiqueta('EstadoViaje', 'NUEVO_ESTADO')).toEqual({ texto: 'Nuevo estado', icono: 'help', tono: 'neutro' });
    expect(etiqueta('EstadoViaje', null).texto).toBe('—');
  });

  it('cc-estado muestra texto e icono decorativo con el tono del valor', () => {
    const f = TestBed.createComponent(Estado);
    f.componentRef.setInput('grupo', 'EstadoUnidad');
    f.componentRef.setInput('valor', 'MANTENIMIENTO_PENDIENTE');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('Mantenimiento pendiente');
    expect(el.dataset['tono']).toBe('aviso');
    expect(el.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('el pipe etiqueta da solo el texto', () => {
    expect(new EtiquetaPipe().transform('INSUMOS_LIQUIDOS', 'TipoCarga')).toBe('Insumos líquidos');
  });
});
