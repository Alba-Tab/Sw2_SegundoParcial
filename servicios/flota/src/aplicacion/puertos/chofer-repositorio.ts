import type { Chofer } from '../../dominio/unidad/chofer';

export interface ChoferRepositorio {
  porId(choferId: string): Promise<Chofer | null>;
  disponibles(): Promise<Chofer[]>;
  /** Actualización condicional disponible: true → false (D11: una reserva activa por chofer). */
  tomar(choferId: string): Promise<boolean>;
  devolver(choferId: string): Promise<void>;
  porUsuarioSub(sub: string): Promise<(Chofer & { versionAgregado: number }) | null>;
  guardar(chofer: Chofer & { versionAgregado: number }): Promise<void>;
  listar(filtro: { activo?: boolean }, despuesDe: string | undefined, limite: number): Promise<Chofer[]>;
}
export const CHOFER_REPOSITORIO = Symbol('ChoferRepositorio');
