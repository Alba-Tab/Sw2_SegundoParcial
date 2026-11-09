import { bootstrapApplication } from '@angular/platform-browser';
import { cargarConfiguracion, configurarApp, mostrarFalloArranque } from 'ui-comun';
import { App } from './app/app';
import { rutas } from './app/app.routes';

// La configuración (issuer, cliente OIDC, Gateway y URL de las otras apps) se lee del hosting antes de arrancar.
cargarConfiguracion()
  .then((config) => bootstrapApplication(App, configurarApp(config, rutas)))
  .catch((e: unknown) => mostrarFalloArranque('Operaciones', e));
