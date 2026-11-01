import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { errorPeriodo, ETIQUETAS, ICONOS, MENSAJES_ERROR, mensajeCampo, montoConDecimales } from 'ui-comun/dominio';
import { cargandoDe, mensajeDe } from './errores';
import { exigirTexto, largoEntre, listoParaEnviar, textoError, validarMonto } from './formulario';

const monto = (valor: string) => new FormControl(valor, [Validators.required, validarMonto]);

describe('formularios (U8, W4)', () => {
  it('el monto es texto decimal con punto, hasta 2 decimales y mayor que 0 (nunca float)', () => {
    for (const ok of ['2800', '2800.5', '2800.50', '0.01', ' 15.00 ']) expect(monto(ok).valid, ok).toBe(true);
    for (const mal of ['2800,50', '2.800,00', '1e3', '12.345', '-5', 'abc']) expect(monto(mal).errors, mal).toEqual({ monto: true });
    expect(monto('0.00').errors).toEqual({ montoCero: true });
    expect(monto('').errors).toEqual({ required: true });
    expect(montoConDecimales('2800.5')).toBe('2800.50');
    expect(montoConDecimales('12345678901.1')).toBe('12345678901.10');
  });

  it('el largo de un texto no cuenta los espacios de los bordes', () => {
    const motivo = new FormControl('', largoEntre(3, 300));
    expect(motivo.errors).toEqual({ largoMinimo: { min: 3 } });
    motivo.setValue('  ab  ');
    expect(motivo.errors).toEqual({ largoMinimo: { min: 3 } });
    motivo.setValue('  cliente pidió  ');
    expect(motivo.valid).toBe(true);
    motivo.setValue('x'.repeat(301));
    expect(motivo.errors).toEqual({ largoMaximo: { max: 300 } });
    expect(new FormControl('', largoEntre(0, 300)).valid).toBe(true);
  });

  it('cada error del campo sale en una frase en español', () => {
    expect(mensajeCampo({ required: true })).toBe('Este dato es obligatorio.');
    expect(mensajeCampo({ largoMinimo: { min: 3 } })).toBe('Escribe al menos 3 caracteres.');
    expect(mensajeCampo({ min: { min: 0.5, actual: 0.2 } })).toBe('Debe ser 0.5 o más.');
    expect(mensajeCampo({ desconocido: true })).toBe('Revisa este dato.');
    expect(textoError(monto('2800,50'))).toContain('punto decimal');
    expect(textoError(null)).toBe('');
  });

  it('el periodo de un reporte no va al revés ni pasa del máximo de días', () => {
    expect(errorPeriodo('2026-11-10', '2026-11-01', 31)).toEqual({ fechaOrden: true });
    expect(errorPeriodo('2026-01-01', '2026-03-01', 31)).toEqual({ rango: { max: 31 } });
    expect(errorPeriodo('2026-11-01', '2026-11-30', 31)).toBeNull();
    expect(mensajeCampo({ rango: { max: 31 } })).toBe('El periodo no puede pasar de 31 días.');
  });

  it('enviar con errores marca todos los campos y enfoca el primero inválido; el botón no se desactiva', () => {
    const raiz = document.createElement('form');
    raiz.innerHTML = `<input formControlName="a" class="ng-valid" /><input formControlName="b" class="ng-invalid" /><input formControlName="c" class="ng-invalid" />`;
    document.body.append(raiz);
    const form = new FormGroup({
      a: new FormControl('x'),
      b: new FormControl('', Validators.required),
      c: new FormControl('', Validators.required),
    });
    expect(listoParaEnviar(form, raiz)).toBe(false);
    expect(form.controls.b.touched && form.controls.c.touched).toBe(true);
    expect(document.activeElement).toBe(raiz.querySelectorAll('input')[1]);
    form.patchValue({ b: 'y', c: 'z' });
    expect(listoParaEnviar(form, raiz)).toBe(true);
    raiz.remove();
  });

  it('el motivo es opcional para aprobar y obligatorio para rechazar', () => {
    const raiz = document.createElement('div');
    const motivo = new FormControl('', { nonNullable: true });
    expect(exigirTexto(motivo, 0, 300, raiz)).toBe(true);
    expect(exigirTexto(motivo, 3, 300, raiz)).toBe(false);
    expect(textoError(motivo)).toBe('Este dato es obligatorio.');
  });
});

describe('errores en pantalla (000 §5)', () => {
  const conCodigo = (codigo: string, message = 'Error: upstream 500 at /api/v1/x') =>
    new CombinedGraphQLErrors({ errors: [{ message, extensions: { codigo } }] });

  it('cada código del catálogo tiene su frase y nunca se muestra el mensaje técnico', () => {
    for (const codigo of [
      'VALIDACION',
      'SIN_PERMISO',
      'CONFLICTO_ESTADO',
      'PAGO_DUPLICADO',
      'ERROR_INTERNO',
      'CONSULTA_DEMASIADO_COMPLEJA',
    ])
      expect(MENSAJES_ERROR[codigo], codigo).toBeDefined();
    expect(mensajeDe(conCodigo('PAGO_EXCEDE_SALDO'))).toBe('El monto supera el saldo de la factura.');
    expect(mensajeDe(conCodigo('CODIGO_NUEVO'))).toBe('No se pudo completar la operación. Intenta de nuevo.');
    expect(mensajeDe(new TypeError('Failed to fetch'))).toContain('No se pudo hablar con el servidor');
    for (const texto of Object.values(MENSAJES_ERROR)) expect(texto).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });

  it('mientras no llega la primera respuesta se está cargando', () => {
    expect(cargandoDe(undefined)).toBe(true);
    expect(cargandoDe({ loading: true })).toBe(true);
    expect(cargandoDe({ loading: true, data: {} })).toBe(false);
    expect(cargandoDe({ loading: false })).toBe(false);
  });
});

describe('iconos (revisión A-1)', () => {
  it('todo icono de ETIQUETAS está en la lista cerrada que trae la fuente recortada', () => {
    const lista = new Set<string>(ICONOS);
    const usados = Object.values(ETIQUETAS).flatMap((grupo) => Object.values(grupo).map((e) => e.icono));
    for (const icono of [...usados, 'help', 'remove']) expect(lista.has(icono), icono).toBe(true);
  });

  it('la lista no tiene repetidos', () => {
    expect(new Set(ICONOS).size).toBe(ICONOS.length);
  });
});
