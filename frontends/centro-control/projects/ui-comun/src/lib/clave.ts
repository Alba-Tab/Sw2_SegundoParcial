/** Una clave por intento (spec 016, paso 11): al abrir el diálogo o en cada clic de "Confirmar". */
export const nuevaClave = (): string => crypto.randomUUID();
