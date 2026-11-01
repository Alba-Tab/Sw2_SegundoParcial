import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Confirmacion, ConfirmacionUnica } from './confirmacion';

@Component({
  imports: [ReactiveFormsModule, Confirmacion],
  template: `<form [formGroup]="form" (ngSubmit)="enviados = enviados + 1">
    <cc-confirmacion resumen="Se registra un pago" accion="Sí, registrar" (volver)="volvio = true" />
  </form>`,
})
class ConfirmacionEnForm {
  readonly form = new FormGroup({});
  enviados = 0;
  volvio = false;
}

describe('Confirmacion dentro de un form (V2-1)', () => {
  it('"No, volver" y el botón de confirmar no envían el formulario', () => {
    const f = TestBed.createComponent(ConfirmacionEnForm);
    f.detectChanges();
    const botones = [...(f.nativeElement as HTMLElement).querySelectorAll('button')];

    expect(botones.map((b) => b.type)).toEqual(['button', 'button']);
    botones[1].click();
    expect(f.componentInstance.volvio).toBe(true);
    expect(f.componentInstance.enviados).toBe(0);
  });
});

describe('ConfirmacionUnica (V2-2, V2-3)', () => {
  const crear = () => {
    const controles: Record<string, FormControl<string>> = {
      a: new FormControl('', { nonNullable: true }),
      b: new FormControl('', { nonNullable: true }),
    };
    return { controles, c: new ConfirmacionUnica((id) => controles[id]) };
  };

  it('abrir la de B libera el control de A', () => {
    const { controles, c } = crear();
    c.abrir('a');
    expect(controles['a'].disabled).toBe(true);
    c.abrir('b');
    expect(c.abierta()).toBe('b');
    expect(controles['a'].enabled).toBe(true);
    expect(controles['b'].disabled).toBe(true);
  });

  it('cerrar con otro id (aprobar B mientras A confirma) no toca la de A', () => {
    const { controles, c } = crear();
    c.abrir('a');
    c.cerrar('b');
    expect(c.abierta()).toBe('a');
    expect(controles['a'].disabled).toBe(true);
    c.cerrar('a');
    expect(c.abierta()).toBeNull();
    expect(controles['a'].enabled).toBe(true);
  });
});
