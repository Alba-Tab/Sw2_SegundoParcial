/** Inbox (000 §6): registra el eventId dentro de la transacción en curso; false si ya se había procesado. */
export interface Inbox {
  registrar(eventId: string, tipo: string): Promise<boolean>;
}
export const INBOX = Symbol('Inbox');
