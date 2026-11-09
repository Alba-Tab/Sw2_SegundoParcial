import { TestBed } from '@angular/core/testing';
import { RutaFormulario } from './ruta-formulario';

const INACTIVA = {
  rutaId: 'r1',
  nombre: 'SCZ - LPZ',
  origen: 'Santa Cruz',
  destino: 'La Paz',
  distanciaKm: 850,
  activa: false,
  radioMetros: 300,
  origenCoordenadas: { lat: -17.78, lng: -63.18 },
  destinoCoordenadas: { lat: -16.5, lng: -68.15 },
};

function crear(inicial: typeof INACTIVA | null = null) {
  const f = TestBed.createComponent(RutaFormulario);
  f.componentRef.setInput('titulo', inicial ? 'Editar ruta' : 'Nueva ruta');
  f.componentRef.setInput('accion', inicial ? 'Guardar cambios' : 'Crear ruta');
  f.componentRef.setInput('inicial', inicial);
  f.detectChanges();
  const emitidos: unknown[] = [];
  f.componentInstance.guardar.subscribe((v) => emitidos.push(v));
  return { f, c: f.componentInstance, raiz: f.nativeElement as HTMLElement, emitidos };
}

describe('formulario de ruta (G4)', () => {
  it('con datos que faltan no envía: marca cada campo y enfoca el primero', () => {
    const { f, c, raiz, emitidos } = crear();
    const boton = raiz.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(boton.disabled).toBe(false);
    boton.click();
    f.detectChanges();
    expect(emitidos).toHaveLength(0);
    expect(c.form.controls.nombre.touched).toBe(true);
    expect(document.activeElement).toBe(raiz.querySelector('input[formcontrolname=nombre]'));
    expect(raiz.querySelectorAll('mat-error').length).toBeGreaterThan(1);
  });

  it('el radio va de 50 a 5000 m y en metros enteros; con todo bien emite los valores', () => {
    const { c, raiz, emitidos } = crear();
    c.form.patchValue({
      nombre: 'SCZ - LPZ',
      origen: 'Santa Cruz',
      origenLat: -17.78,
      origenLng: -63.18,
      destino: 'La Paz',
      destinoLat: -16.5,
      destinoLng: -68.15,
      distanciaKm: 850,
    });
    c.form.controls.radioMetros.setValue(40);
    expect(c.texto(c.form.controls.radioMetros)).toBe('Debe ser 50 o más.');
    c.form.controls.radioMetros.setValue(300.5);
    expect(c.texto(c.form.controls.radioMetros)).toBe('Escribe un número entero de metros.');
    c.form.controls.radioMetros.setValue(300);
    c.enviar(raiz);
    expect(emitidos).toEqual([expect.objectContaining({ nombre: 'SCZ - LPZ', radioMetros: 300 })]);
  });

  it('el alta no ofrece activarla y dice que queda inactiva hasta tener su tarifa (F1-2)', () => {
    const { raiz } = crear();
    expect(raiz.querySelector('mat-checkbox')).toBeNull();
    expect(raiz.textContent).toContain('La ruta queda inactiva hasta tener su tarifa.');
  });

  it('D108: activar una ruta inactiva pide confirmación; «volver» no envía y «Sí» envía con activa', () => {
    const { f, c, raiz, emitidos } = crear(INACTIVA);
    c.form.controls.activa.setValue(true);
    c.enviar(raiz);
    f.detectChanges();
    expect(emitidos).toHaveLength(0);
    expect(c.form.disabled).toBe(true);
    expect(raiz.textContent).toContain('Sin tarifa de semilla, el portal no podrá cotizarla. ¿Activarla igual?');
    c.volver();
    f.detectChanges();
    expect(c.form.enabled).toBe(true);
    expect(emitidos).toHaveLength(0);
    c.enviar(raiz);
    c.confirmarActivacion();
    expect(emitidos).toEqual([expect.objectContaining({ activa: true })]);
  });

  it('D108: guardar sin activarla no pide confirmación', () => {
    const { c, raiz, emitidos } = crear(INACTIVA);
    c.form.controls.nombre.setValue('SCZ - LPZ 2');
    c.enviar(raiz);
    expect(c.confirmando()).toBe(false);
    expect(emitidos).toEqual([expect.objectContaining({ nombre: 'SCZ - LPZ 2', activa: false })]);
  });
});
