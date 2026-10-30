import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { entorno } from '../configuracion/entorno';

const BASE = 'https://transporte.local/contratos';

/**
 * Valida cada sobre contra contratos/eventos antes de escribirlo en el Outbox (000 §6). Carga todos los esquemas al
 * arrancar; los `$ref` relativos se resuelven por sus `$id` (https://transporte.local/contratos/…).
 */
@Injectable()
export class ValidadorEventos {
  private readonly ajv = new Ajv2020({ strict: false, allErrors: true });

  constructor() {
    addFormats(this.ajv);
    const dir = entorno().CONTRATOS_DIR;
    const leer = (ruta: string) => this.ajv.addSchema(JSON.parse(readFileSync(ruta, 'utf8')));
    leer(join(dir, 'comun', 'tipos.schema.json'));
    leer(join(dir, 'eventos', 'sobre.schema.json'));
    for (const productor of readdirSync(join(dir, 'eventos'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const archivo of readdirSync(join(dir, 'eventos', productor.name)).filter((a) => a.endsWith('.schema.json'))) {
        leer(join(dir, 'eventos', productor.name, archivo));
      }
    }
  }

  validar(tipo: string, version: number, sobre: unknown): void {
    const v = this.ajv.getSchema(`${BASE}/eventos/flota/${tipo}.v${version}.schema.json`);
    if (!v) throw new Error(`No hay contrato para ${tipo} v${version}`);
    if (!v(sobre)) throw new Error(`${tipo} v${version} no cumple su contrato: ${this.ajv.errorsText(v.errors)}`);
  }
}
