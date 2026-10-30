import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { motor } from './contenedor';

/** Disparador en segundo plano del motor (spec 005); se define al cargar el bundle, antes de registrar la app. */
export const TAREA_SINCRONIZAR = 'sincronizar-cola';

TaskManager.defineTask(TAREA_SINCRONIZAR, async () => {
  try {
    await motor.sincronizar();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registrarTareaFondo(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(TAREA_SINCRONIZAR))) {
    // El sistema decide cuándo correrla; 15 min es el mínimo que permiten Android e iOS.
    await BackgroundTask.registerTaskAsync(TAREA_SINCRONIZAR, { minimumInterval: 15 });
  }
}

/** Al cerrar sesión: sin chofer no hay nada que sincronizar en segundo plano (se registra otra vez al entrar). */
export async function quitarTareaFondo(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TAREA_SINCRONIZAR)) await BackgroundTask.unregisterTaskAsync(TAREA_SINCRONIZAR);
}
