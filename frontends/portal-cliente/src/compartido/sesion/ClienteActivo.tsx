import { createContext, type ReactNode, useContext, useState } from 'react';
import { useSesion } from './useSesion';

interface Elegido {
  clienteId?: string;
  razonSocial?: string;
}
const CLAVE = 'portal-cliente-activo';

function guardar(e: Elegido) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    // Sin sessionStorage (modo privado estricto): la elección dura hasta recargar.
  }
}

/**
 * "Ver como cliente" (propuesta 7.7) abre el portal con ?clienteId=…; se guarda en la pestaña porque el inicio de
 * sesión pasa por Keycloak y la vuelta recarga la página sin ese parámetro. Sin parámetro, el último elegido aquí.
 */
export function leerClienteActivo(): Elegido {
  let guardado: Elegido = {};
  try {
    guardado = JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}') as Elegido;
  } catch {
    // Sin sessionStorage o con un valor ilegible: nada elegido.
  }
  const deUrl = new URLSearchParams(window.location.search).get('clienteId');
  if (!deUrl || deUrl === guardado.clienteId) return guardado;
  const elegido = { clienteId: deUrl };
  guardar(elegido);
  return elegido;
}

const Contexto = createContext<{ elegido: Elegido; elegir: (e: Elegido) => void } | null>(null);

export function ProveedorClienteActivo({ children }: { children: ReactNode }) {
  const [elegido, setElegido] = useState<Elegido>(leerClienteActivo);
  const elegir = (e: Elegido) => {
    setElegido(e);
    guardar(e);
  };
  return <Contexto.Provider value={{ elegido, elegir }}>{children}</Contexto.Provider>;
}

export interface ClienteActivo extends Elegido {
  /** Atención comercial pide a nombre de un cliente (spec 001 y 003): el clienteId va en cada petición. */
  modoComercial: boolean;
  elegir: (e: Elegido) => void;
}

/** El cliente del token o, en modo comercial, el que eligió atención comercial. */
export function useClienteActivo(): ClienteActivo {
  const sesion = useSesion();
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useClienteActivo fuera de ProveedorClienteActivo');
  if (sesion.esComercial) return { ...ctx.elegido, modoComercial: true, elegir: ctx.elegir };
  return { clienteId: sesion.clienteId, modoComercial: false, elegir: ctx.elegir };
}
