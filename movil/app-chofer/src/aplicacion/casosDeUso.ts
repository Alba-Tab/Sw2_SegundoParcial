import { esPositivo, normalizarMonto } from '../dominio/dinero';
import { ErrorDeUsuario } from '../dominio/errores';
import type { TipoEvidencia } from '../dominio/evidencia';
import { descripcionValida, type OrigenHito, type TipoHito } from '../dominio/hito';
import { agregarLectura, kmh, type Lectura, MuestreoGps, velocidadEstimada } from '../dominio/muestreo';
import type { TipoOperacion } from '../dominio/operacion';
import { estadoVisible, inicioRechazado, puedeIniciar, type ViajeLocal } from '../dominio/viaje';
import type {
  Api,
  Archivos,
  Cola,
  Dispositivo,
  EnTransaccion,
  Evidencias,
  FatigasSinPosicion,
  Ids,
  PosicionGuardada,
  PuntosGps,
  Reloj,
  Sesion,
  Viajes,
} from './puertos';

/**
 * Guarda lo que bajó de `GET /viajes/mios` y libera los inicios que Viajes rechazó con el viaje todavía CONFIRMADO
 * (D106). Lo usan la descarga del chofer y la del motor tras un 409: sin red, decide la próxima descarga.
 */
export function guardarViajesDelServidor(viajes: Viajes, cola: Cola, delServidor: ViajeLocal[]): void {
  viajes.guardarDelServidor(delServidor);
  const ops = cola.visibles();
  for (const v of viajes.todos()) if (inicioRechazado(v, ops)) viajes.liberarMarca(v.viajeId, 'INICIO');
}

/** Lo que hace el chofer. Las escrituras van primero a la cola local; el motor las envía cuando hay señal. */
export class CasosDeUso {
  private readonly muestreos = new Map<string, MuestreoGps>();
  private ultima: Lectura | null = null;
  /** Las lecturas que sirven para estimar la velocidad cuando el GPS no la da. */
  private recientes: Lectura[] = [];

  constructor(
    private readonly cola: Cola,
    private readonly puntos: PuntosGps,
    private readonly viajes: Viajes,
    private readonly api: Api,
    private readonly sesion: Sesion,
    private readonly reloj: Reloj,
    private readonly ids: Ids,
    private readonly dispositivo: Dispositivo,
    private readonly evidencias: Evidencias,
    private readonly archivos: Archivos,
    private readonly posicionGuardada: PosicionGuardada | null = null,
    private readonly enTransaccion: EnTransaccion = (fn) => fn(),
    private readonly fatigasSinPosicion: FatigasSinPosicion | null = null,
  ) {}

  /** Paso 1 (con señal): `GET /viajes/mios` a SQLite para operar sin red. */
  async descargarViajes(): Promise<void> {
    guardarViajesDelServidor(this.viajes, this.cola, await this.api.misViajes(await this.sesion.tokenVigente()));
    this.encolarFatigasSinPosicion(null);
  }

  /** Paso 2: el `opId` y la hora salen del celular al pulsar, no al enviar (FO1). */
  iniciarViaje(viajeId: string, posicion: { lat: number; lng: number } | null): string {
    const v = this.viajes.porId(viajeId);
    if (!v || !puedeIniciar(v, this.viajes.todos())) throw new ErrorDeUsuario('Este viaje no se puede iniciar ahora');
    const opId = this.encolar(viajeId, 'INICIO', {
      dispositivoId: this.dispositivo.id(),
      iniciadoEn: this.reloj.ahora().toISOString(),
      ...(posicion ? { posicion } : {}),
    });
    this.viajes.marcarIniciado(viajeId);
    return opId;
  }

  /** Spec 005, paso 4: cada lectura del GPS; se guarda solo si pasa el muestreo de D52. */
  registrarLectura(viajeId: string, l: Lectura): boolean {
    this.ultima = l;
    this.recientes = agregarLectura(this.recientes, l);
    this.posicionGuardada?.guardar({ lat: l.lat, lng: l.lng });
    this.encolarFatigasSinPosicion({ viajeId, posicion: { lat: l.lat, lng: l.lng } });
    const muestreo = this.muestreos.get(viajeId) ?? new MuestreoGps();
    this.muestreos.set(viajeId, muestreo);
    if (!muestreo.aceptar(l)) return false;
    this.puntos.agregar({
      viajeId,
      seq: this.puntos.siguienteSeq(viajeId),
      registradaEn: new Date(l.en).toISOString(),
      lat: l.lat,
      lng: l.lng,
      velocidadKmh: kmh(l.velocidadMs),
      precisionMetros: l.precisionMetros,
    });
    return true;
  }

  ultimaPosicion(): { lat: number; lng: number } | null {
    return this.ultima ? { lat: this.ultima.lat, lng: this.ultima.lng } : null;
  }

  /** La velocidad del camión ahora, o `null` si no se sabe (ver `velocidadEstimada`). */
  velocidadKmh(): number | null {
    return velocidadEstimada(this.recientes, this.reloj.ahora().getTime());
  }

  /**
   * Para los eventos de conducción, que el contrato pide con `posicion`: la última lectura de esta sesión o, si el GPS
   * todavía no dio ninguna (la app se reabrió en un túnel), la última guardada en el celular.
   */
  private posicionParaEvento(): { lat: number; lng: number } | null {
    return this.ultimaPosicion() ?? this.posicionGuardada?.leer() ?? null;
  }

  /** Al cerrar sesión: nada de la posición ni del muestreo del chofer anterior queda en memoria. */
  olvidar(): void {
    this.ultima = null;
    this.recientes = [];
    this.muestreos.clear();
  }

  /** Spec 005, paso 8: la frenada detectada en el celular (D08) va a la cola con la última posición del GPS. */
  registrarFrenada(viajeId: string, magnitudG: number): string | null {
    const posicion = this.posicionParaEvento();
    if (!posicion) return null;
    return this.encolar(viajeId, 'EVENTO_CONDUCCION', {
      eventoId: this.ids.nuevo(),
      tipo: 'FRENADA_BRUSCA',
      magnitudG,
      posicion,
      registradoEn: this.reloj.ahora().toISOString(),
    });
  }

  /**
   * D60 (FO6): ojos cerrados o bostezos; la alarma ya sonó en el celular, esto solo deja el evento en la cola. Sin
   * ninguna posición conocida (ni guardada), la alerta se guarda con su hora y sale con la primera lectura del GPS
   * (decisión del 01-11-2026); entonces devuelve null.
   */
  registrarFatiga(viajeId: string): string | null {
    const eventoId = this.ids.nuevo();
    const registradoEn = this.reloj.ahora().toISOString();
    const posicion = this.posicionParaEvento();
    if (posicion) return this.encolar(viajeId, 'EVENTO_CONDUCCION', { eventoId, tipo: 'ALERTA_FATIGA', posicion, registradoEn });
    this.fatigasSinPosicion?.guardar([...this.fatigasSinPosicion.leer(), { viajeId, eventoId, registradoEn }]);
    return null;
  }

  /**
   * Las alertas que esperaban una posición salen con la primera lectura de su viaje; `registradoEn` sigue siendo la hora
   * de la alerta. Las de un viaje que ya no está en ruta (ahí no llegan más lecturas) salen con la posición guardada, si
   * hay (E2-9). Corre con cada lectura y con cada descarga de viajes.
   */
  private encolarFatigasSinPosicion(lectura: { viajeId: string; posicion: { lat: number; lng: number } } | null): void {
    const guardadas = this.fatigasSinPosicion?.leer() ?? [];
    if (guardadas.length === 0) return;
    const guardada = this.posicionGuardada?.leer() ?? null;
    const salen = guardadas.map((f) => ({
      f,
      posicion: f.viajeId === lectura?.viajeId ? lectura.posicion : this.enRuta(f.viajeId) ? null : guardada,
    }));
    if (salen.every((s) => !s.posicion)) return;
    this.enTransaccion(() => {
      for (const { f, posicion } of salen) {
        if (posicion)
          this.encolar(f.viajeId, 'EVENTO_CONDUCCION', {
            eventoId: f.eventoId,
            tipo: 'ALERTA_FATIGA',
            posicion,
            registradoEn: f.registradoEn,
          });
      }
      this.fatigasSinPosicion?.guardar(salen.filter((s) => !s.posicion).map((s) => s.f));
    });
  }

  private enRuta(viajeId: string): boolean {
    const v = this.viajes.porId(viajeId);
    return !!v && estadoVisible(v) === 'EN_RUTA';
  }

  /**
   * Spec 005, paso 7: el chofer revisó el texto (dictado o escrito) y eligió el tipo. Solo el texto va a la cola; el
   * audio se queda en el celular (D53).
   */
  registrarHito(viajeId: string, tipo: TipoHito, descripcion: string, origen: OrigenHito): string {
    this.exigirEnRuta(viajeId);
    if (!descripcionValida(descripcion)) throw new ErrorDeUsuario('La descripción debe tener de 3 a 500 caracteres');
    const posicion = this.ultimaPosicion();
    if (!posicion) throw new ErrorDeUsuario('Esperando la posición del GPS; intenta en unos segundos');
    return this.encolar(viajeId, 'HITO', {
      hitoId: this.ids.nuevo(),
      tipo,
      descripcion: descripcion.trim(),
      posicion,
      registradoEn: this.reloj.ahora().toISOString(),
      origen,
    });
  }

  /**
   * Spec 006: fotos (y firma si hay receptor) con la posición del GPS. Viajes decide si queda ENTREGADO o
   * ENTREGA_OBSERVADA (geocerca y firma); aquí el viaje deja de estar en ruta y el GPS se detiene.
   */
  entregar(
    viajeId: string,
    fotos: string[],
    firma: { archivo: string; nombreReceptor: string } | null,
    observacion: string | null,
    precisionMetros: number | null,
  ): string {
    this.exigirEnRuta(viajeId);
    const posicion = this.exigirPosicion();
    if (fotos.length < 1 || fotos.length > 3) throw new ErrorDeUsuario('Toma de 1 a 3 fotos de la entrega');
    return this.conEvidencias((evidencia) => {
      const idsFotos = fotos.map((f) => evidencia(viajeId, 'FOTO_ENTREGA', f));
      const idFirma = firma ? evidencia(viajeId, 'FIRMA', firma.archivo) : null;
      const opId = this.encolar(
        viajeId,
        'ENTREGA',
        {
          entregaId: this.ids.nuevo(),
          entregadoEn: this.reloj.ahora().toISOString(),
          posicion,
          ...(precisionMetros !== null ? { precisionMetros } : {}),
          fotos: idsFotos,
          firma: idFirma && firma ? { evidenciaId: idFirma, nombreReceptor: firma.nombreReceptor.trim() } : null,
          ...(observacion?.trim() ? { observacion: observacion.trim() } : {}),
        },
        idFirma ? [...idsFotos, idFirma] : idsFotos,
      );
      this.viajes.marcarEntregaLocal(viajeId, 'ENTREGA');
      return opId;
    });
  }

  /** Spec 007: el receptor no acepta la carga; el motivo y de 1 a 3 fotos. */
  rechazar(viajeId: string, motivo: string, fotos: string[]): string {
    this.exigirEnRuta(viajeId);
    const posicion = this.exigirPosicion();
    if (motivo.trim().length < 3) throw new ErrorDeUsuario('Escribe el motivo del rechazo');
    if (motivo.trim().length > 300) throw new ErrorDeUsuario('El motivo puede tener hasta 300 caracteres');
    if (fotos.length < 1 || fotos.length > 3) throw new ErrorDeUsuario('Toma de 1 a 3 fotos');
    return this.conEvidencias((evidencia) => {
      const ids = fotos.map((f) => evidencia(viajeId, 'FOTO_RECHAZO', f));
      const opId = this.encolar(
        viajeId,
        'RECHAZO',
        { entregaId: this.ids.nuevo(), rechazadaEn: this.reloj.ahora().toISOString(), posicion, motivo: motivo.trim(), fotos: ids },
        ids,
      );
      this.viajes.marcarEntregaLocal(viajeId, 'RECHAZO');
      return opId;
    });
  }

  /**
   * Spec 009: la carga de diésel va a Flota con su `opId` como Idempotency-Key (Flota exige que sean iguales). La
   * foto del recibo se sube antes como evidencia RECIBO_COMBUSTIBLE. El monto llega como lo escribió el chofer y se
   * normaliza como texto (000 §3), nunca como `number`.
   */
  cargarCombustible(viajeId: string, datos: { litros: number; monto: string; kilometraje: number; foto: string | null }): string {
    this.exigirEnRuta(viajeId);
    const monto = normalizarMonto(datos.monto);
    if (monto === null) throw new ErrorDeUsuario('Escribe el monto en Bs con hasta 2 decimales, por ejemplo 675,50');
    if (!(datos.litros > 0) || !esPositivo(monto) || !(datos.kilometraje > 0)) {
      throw new ErrorDeUsuario('Litros, monto y kilometraje deben ser mayores que 0');
    }
    return this.conEvidencias((evidencia) => {
      const foto = datos.foto ? evidencia(viajeId, 'RECIBO_COMBUSTIBLE', datos.foto) : null;
      const opId = this.ids.nuevo();
      const posicion = this.ultimaPosicion();
      this.cola.agregar({
        ...this.nueva(opId, viajeId, 'CARGA_COMBUSTIBLE', {
          opId,
          viajeId,
          litros: datos.litros,
          monto: { monto, moneda: 'BOB' },
          kilometraje: datos.kilometraje,
          registradaEn: this.reloj.ahora().toISOString(),
          ...(posicion ? { posicion } : {}),
          ...(foto ? { fotoReciboEvidenciaId: foto } : {}),
        }),
        evidencias: foto ? [foto] : [],
      });
      return opId;
    });
  }

  /**
   * Copia las fotos y firmas y corre `fn` en una transacción: las filas de evidencia, la operación y la marca del viaje
   * quedan todas o ninguna. Si algo falla a mitad (la segunda foto, la cola, la marca), además se borran las copias: sin
   * esto quedaban evidencias huérfanas, o una entrega encolada que el chofer volvía a registrar.
   */
  private conEvidencias<T>(fn: (evidencia: (viajeId: string, tipo: TipoEvidencia, origen: string) => string) => T): T {
    const hechas: { evidenciaId: string; archivo: string }[] = [];
    try {
      return this.enTransaccion(() =>
        fn((viajeId, tipo, origen) => {
          const evidenciaId = this.ids.nuevo();
          const png = origen.toLowerCase().endsWith('.png');
          const { archivo, tamanoBytes } = this.archivos.guardar(origen, `${evidenciaId}.${png ? 'png' : 'jpg'}`);
          hechas.push({ evidenciaId, archivo });
          this.evidencias.agregar({
            evidenciaId,
            viajeId,
            tipo,
            archivo,
            contentType: png ? 'image/png' : 'image/jpeg',
            tamanoBytes,
            estado: 'PENDIENTE',
          });
          return evidenciaId;
        }),
      );
    } catch (e) {
      for (const h of hechas) {
        // Cada borrado por su lado: uno que falla no corta la limpieza ni tapa el error original.
        try {
          this.evidencias.borrar(h.evidenciaId);
        } catch {
          // la transacción ya la deshizo
        }
        this.archivos.borrar(h.archivo);
      }
      throw e;
    }
  }

  private exigirEnRuta(viajeId: string): void {
    if (!this.enRuta(viajeId)) throw new ErrorDeUsuario('Este viaje ya no está en ruta');
  }

  private exigirPosicion(): { lat: number; lng: number } {
    const p = this.ultimaPosicion();
    if (!p) throw new ErrorDeUsuario('Esperando la posición del GPS; intenta en unos segundos');
    return p;
  }

  /** Hitos, eventos de conducción, cargas y entregas usan la misma cola (T7.3 a T7.6). */
  encolar(viajeId: string, tipo: TipoOperacion, cuerpo: Record<string, unknown>, evidencias: string[] = []): string {
    const opId = this.ids.nuevo();
    this.cola.agregar({ ...this.nueva(opId, viajeId, tipo, cuerpo), evidencias });
    return opId;
  }

  private nueva(opId: string, viajeId: string, tipo: TipoOperacion, cuerpo: Record<string, unknown>) {
    return {
      opId,
      viajeId,
      tipo,
      cuerpo,
      creadaEn: this.reloj.ahora().toISOString(),
      intentos: 0,
      proximoIntentoEn: null,
      estado: 'PENDIENTE' as const,
      codigoError: null,
      cerradaEn: null,
      evidencias: [],
    };
  }

  /** `PUT /dispositivos/mio` después de iniciar sesión (spec 005); el token push lo agrega T7.8. */
  async registrarDispositivo(tokenPush: string | null = null): Promise<void> {
    await this.api.registrarDispositivo(this.dispositivo.id(), this.dispositivo.plataforma(), tokenPush, await this.sesion.tokenVigente());
  }
}
