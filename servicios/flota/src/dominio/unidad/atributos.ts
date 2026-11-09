import { ErrorDeDominio } from '../comun/error-de-dominio';
import type { TipoRemolque, TipoUnidad } from './unidad';

interface Regla {
  min: number;
  max: number;
  entero?: boolean;
  opcional?: boolean;
}

/** D76: los atributos de cada tipo; un campo de otro tipo o fuera de rango no se acepta (spec 010). */
const REGLAS: Record<'TRACTO' | TipoRemolque, Record<string, Regla>> = {
  TRACTO: { capacidadTanqueLitros: { min: 100, max: 1500 }, potenciaHp: { min: Number.MIN_VALUE, max: Infinity, opcional: true } },
  FURGON: { volumenM3: { min: 10, max: 120 } },
  PLATAFORMA: { largoMetros: { min: 6, max: 15 } },
  CISTERNA: { compartimentos: { min: 1, max: 6, entero: true }, capacidadLitros: { min: 5000, max: 45000 } },
};

export function validarAtributos(tipoUnidad: TipoUnidad, tipoRemolque: TipoRemolque | undefined, atributos: Record<string, unknown>): void {
  const clave = tipoUnidad === 'TRACTO' ? 'TRACTO' : tipoRemolque;
  if (!clave) return;
  const reglas = REGLAS[clave];
  for (const campo of Object.keys(atributos)) {
    // Object.hasOwn y no `in`: `in` recorre el prototipo y aceptaría `constructor`, `toString` o `__proto__`.
    if (!Object.hasOwn(reglas, campo)) invalido(campo, `no es un atributo de ${clave}`);
  }
  for (const [campo, r] of Object.entries(reglas)) {
    const v = atributos[campo];
    if (v === undefined) {
      if (!r.opcional) invalido(campo, `es obligatorio en ${clave}`);
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < r.min || v > r.max || (r.entero && !Number.isInteger(v))) {
      invalido(campo, r.max === Infinity ? 'debe ser un número mayor que 0' : `debe estar entre ${r.min} y ${r.max}`);
    }
  }
}

function invalido(campo: string, mensaje: string): never {
  throw new ErrorDeDominio('VALIDACION', `atributos.${campo}: ${mensaje}`, { campo: `atributos.${campo}` });
}
