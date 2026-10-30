import type { TipoEvidencia } from '../dominio/evidencia';
import { descripcionValida, type OrigenHito, type TipoHito } from '../dominio/hito';
import { kmh, type Lectura, MuestreoGps } from '../dominio/muestreo';
import type { TipoOperacion } from '../dominio/operacion';
import { puedeIniciar } from '../dominio/viaje';
import type { Api, Archivos, Cola, Dispositivo, Evidencias, Ids, PuntosGps, Reloj, Sesion, Viajes } from './puertos';

/** Lo que hace el chofer. Las escrituras van primero a la cola local; el motor las envía cuando hay señal. */
export class CasosDeUso {
  private readonly muestreos = new Map<string, MuestreoGps>();
  private ultima: Lectura | null = null;

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
  ) {}

  /** Paso 1 (con señal): `GET /viajes/mios` a SQLite para operar sin red. */
  async descargarViajes(): Promise<void> {
    this.viajes.guardarDelServidor(await this.api.misViajes(await this.sesion.tokenVigente()));
  }

  /** Paso 2: el `opId` y la hora salen del celular al pulsar, no al enviar (FO1). */
  iniciarViaje(viajeId: string, posicion: { lat: number; lng: number } | null): string {
    const v = this.viajes.porId(viajeId);
    if (!v || !puedeIniciar(v, this.viajes.todos())) throw new Error('Este viaje no se puede iniciar ahora');
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

  velocidadKmh(): number {
    return this.ultima ? kmh(this.ultima.velocidadMs) : 0;
  }

  /** Spec 005, paso 8: la frenada detectada en el celular (D08) va a la cola con la última posición del GPS. */
  registrarFrenada(viajeId: string, magnitudG: number): string | null {
    const posicion = this.ultimaPosicion();
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
   * Spec 005, paso 7: el chofer revisó el texto (dictado o escrito) y eligió el tipo. Solo el texto va a la cola; el
   * audio se queda en el celular (D53).
   */
  registrarHito(viajeId: string, tipo: TipoHito, descripcion: string, origen: OrigenHito): string {
    if (!descripcionValida(descripcion)) throw new Error('La descripción debe tener de 3 a 500 caracteres');
    const posicion = this.ultimaPosicion();
    if (!posicion) throw new Error('Esperando la posición del GPS; intenta en unos segundos');
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
    const posicion = this.exigirPosicion();
    if (fotos.length < 1 || fotos.length > 3) throw new Error('Toma de 1 a 3 fotos de la entrega');
    const idsFotos = fotos.map((f) => this.evidencia(viajeId, 'FOTO_ENTREGA', f));
    const idFirma = firma ? this.evidencia(viajeId, 'FIRMA', firma.archivo) : null;
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
  }

  /** Spec 007: el receptor no acepta la carga; el motivo y de 1 a 3 fotos. */
  rechazar(viajeId: string, motivo: string, fotos: string[]): string {
    const posicion = this.exigirPosicion();
    if (motivo.trim().length < 3) throw new Error('Escribe el motivo del rechazo');
    if (fotos.length < 1 || fotos.length > 3) throw new Error('Toma de 1 a 3 fotos');
    const ids = fotos.map((f) => this.evidencia(viajeId, 'FOTO_RECHAZO', f));
    const opId = this.encolar(
      viajeId,
      'RECHAZO',
      { entregaId: this.ids.nuevo(), rechazadaEn: this.reloj.ahora().toISOString(), posicion, motivo: motivo.trim(), fotos: ids },
      ids,
    );
    this.viajes.marcarEntregaLocal(viajeId, 'RECHAZO');
    return opId;
  }

  /**
   * Spec 009: la carga de diésel va a Flota con su `opId` como Idempotency-Key (Flota exige que sean iguales). La
   * foto del recibo se sube antes como evidencia RECIBO_COMBUSTIBLE.
   */
  cargarCombustible(viajeId: string, datos: { litros: number; monto: string; kilometraje: number; foto: string | null }): string {
    if (!(datos.litros > 0) || !(Number(datos.monto) > 0) || !(datos.kilometraje > 0)) {
      throw new Error('Litros, monto y kilometraje deben ser mayores que 0');
    }
    const foto = datos.foto ? this.evidencia(viajeId, 'RECIBO_COMBUSTIBLE', datos.foto) : null;
    const opId = this.ids.nuevo();
    const posicion = this.ultimaPosicion();
    this.cola.agregar({
      ...this.nueva(opId, viajeId, 'CARGA_COMBUSTIBLE', {
        opId,
        viajeId,
        litros: datos.litros,
        monto: { monto: Number(datos.monto).toFixed(2), moneda: 'BOB' },
        kilometraje: datos.kilometraje,
        registradaEn: this.reloj.ahora().toISOString(),
        ...(posicion ? { posicion } : {}),
        ...(foto ? { fotoReciboEvidenciaId: foto } : {}),
      }),
      evidencias: foto ? [foto] : [],
    });
    return opId;
  }

  private evidencia(viajeId: string, tipo: TipoEvidencia, origen: string): string {
    const evidenciaId = this.ids.nuevo();
    const png = origen.toLowerCase().endsWith('.png');
    const { archivo, tamanoBytes } = this.archivos.guardar(origen, `${evidenciaId}.${png ? 'png' : 'jpg'}`);
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
  }

  private exigirPosicion(): { lat: number; lng: number } {
    const p = this.ultimaPosicion();
    if (!p) throw new Error('Esperando la posición del GPS; intenta en unos segundos');
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
