import { CierreSesion } from '../aplicacion/cierreSesion';
import { casos, cola, puntos, sesion } from './contenedor';
import { detenerGps } from './gps';
import { DatosDelChoferSqlite } from './repositorios';
import { quitarTareaFondo } from './tareaFondo';

/**
 * Composición del cierre de sesión. Va aparte de `contenedor` porque el GPS y la tarea de fondo importan el contenedor
 * al definir sus tareas.
 */
export const cierre = new CierreSesion(
  cola,
  puntos,
  new DatosDelChoferSqlite(),
  sesion,
  {
    detener: async () => {
      await Promise.allSettled([detenerGps(), quitarTareaFondo()]);
    },
  },
  casos,
);
