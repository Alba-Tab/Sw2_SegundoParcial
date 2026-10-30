import { createContext, type ReactNode, useContext, useState } from 'react';
import { useSesion } from './useSesion';

interface Elegido {
  clienteId?: string;
  razonSocial?: string;
}
const CLAVE = 'portal-cliente-activo';

function leer(): Elegido {
  // "Ver como cliente" (propuesta 7.7) abre el portal con ?clienteId=…; si no, el último elegido en esta pestaña.
  const deUrl = new URLSearchParams(window.location.search).get('clienteId');
  if (deUrl) return { clienteId: deUrl };
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) ?? '{}') as Elegido;
  } catch {
    return {};
  }
}

const Contexto = createContext<{ elegido: Elegido; elegir: (e: Elegido) => void } | null>(null);

export function ProveedorClienteActivo({ children }: { children: ReactNode }) {
  const [elegido, setElegido] = useState<Elegido>(leer);
  const elegir = (e: Elegido) => {
    setElegido(e);
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(e));
    } catch {
      // Sin sessionStorage (modo privado estricto): la elección dura hasta recargar.
    }
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
