/**
 * Toda fecha de extracto termina en `FechaContable`, nunca en `Date`
 * (design §8.2, CLAUDE.md §4.6). `new Date(string)` PROHIBIDO en este
 * archivo — depende del locale del proceso que corre el servidor.
 *
 * Tres dialectos en v1 (design §8.2):
 *   - `SERIAL_EXCEL` (BancoSol): número de serie de Excel, época 1899-12-30
 *     (bug del año bisiesto 1900 de Excel). La parte fraccionaria es la
 *     hora del día.
 *   - `TEXTO_ES_DD_MMM_YYYY` (Económico): `DD/Mmm/YYYY` con mapa de meses en
 *     español, sin diacríticos, `SET` como alias de `SEP`.
 *   - `DD_MM_YYYY` (Unión XLSX): string `DD/MM/YYYY`, con hora opcional
 *     separada por espacio.
 */
import { FechaContable } from '@/common/domain/fecha-contable';

export type DialectoFecha =
  | { readonly tipo: 'SERIAL_EXCEL' }
  | { readonly tipo: 'TEXTO_ES_DD_MMM_YYYY' }
  | { readonly tipo: 'DD_MM_YYYY' };

export interface FechaLeida {
  readonly fecha: FechaContable;
  /** `'HH:MM:SS'` — `null` si la celda no trae hora. Display, nunca entra al hash. */
  readonly hora: string | null;
}

// Época de Excel: 1899-12-30 (por el bug del año bisiesto 1900 que Excel
// heredó de Lotus 1-2-3). Serial 1 = 1899-12-31. NO se construye como
// `FechaContable` (rechazaría año < 1900 — CLAUDE.md §4.6 acepta 1900-2999):
// la aritmética de la época vive en UTC crudo, y solo el resultado FINAL
// (siempre ≥ 1900 para cualquier serial real de un extracto boliviano) pasa
// por `FechaContable.of`, que sigue siendo la validación de calendario.
const EPOCA_EXCEL_UTC_MS = Date.UTC(1899, 11, 30);
const SERIAL_MAXIMO = 60000; // ≈ año 2064

const MESES_ES: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  SET: 9, // variante ortográfica boliviana de "setiembre"
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

function leerSerialExcel(raw: string): FechaLeida {
  const partes = raw.trim().split('.');
  const entStr = partes[0];
  const fracStr = partes[1];
  if (!entStr) {
    throw new RangeError(`leerFechaCelda: serial de Excel vacío ("${raw}")`);
  }
  // Number() es seguro acá: `ent` es un entero pequeño (« 2^53), muy lejos
  // de perder precisión — a diferencia del dinero (§8.1), esto NO es un
  // monto.
  const ent = Number(entStr);
  if (!Number.isInteger(ent) || ent < 1 || ent > SERIAL_MAXIMO) {
    throw new RangeError(`leerFechaCelda: serial de Excel fuera de rango (${raw})`);
  }
  const dDesplazado = new Date(EPOCA_EXCEL_UTC_MS + ent * 86400000);
  const fecha = FechaContable.of(
    dDesplazado.getUTCFullYear(),
    dDesplazado.getUTCMonth() + 1,
    dDesplazado.getUTCDate(),
  );

  if (!fracStr) {
    return { fecha, hora: null };
  }
  // Float aceptable acá: `hora` es display, nullable, jamás entra al hash
  // ni a un cálculo (§8.2). El redondeo es obligatorio.
  const fraccion = Number(`0.${fracStr}`);
  const segundosTotales = Math.round(fraccion * 86400);
  const hh = Math.floor(segundosTotales / 3600);
  const mm = Math.floor((segundosTotales % 3600) / 60);
  const ss = segundosTotales % 60;
  const hora = [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
  return { fecha, hora };
}

function leerTextoEs(raw: string): FechaLeida {
  const partes = raw.trim().split('/');
  if (partes.length !== 3) {
    throw new RangeError(`leerFechaCelda: formato DD/Mmm/YYYY inválido ("${raw}")`);
  }
  const [diaStr, mesStr, anioStr] = partes;
  const mes = MESES_ES[(mesStr ?? '').toUpperCase()];
  if (mes === undefined) {
    throw new RangeError(`leerFechaCelda: mes en español no reconocido ("${mesStr}")`);
  }
  const fecha = FechaContable.of(Number(anioStr), mes, Number(diaStr));
  return { fecha, hora: null };
}

function leerDdMmYyyy(raw: string): FechaLeida {
  const [fechaParte, horaParte] = raw.trim().split(/\s+/);
  const partes = (fechaParte ?? '').split('/');
  if (partes.length !== 3) {
    throw new RangeError(`leerFechaCelda: formato DD/MM/YYYY inválido ("${raw}")`);
  }
  const [diaStr, mesStr, anioStr] = partes;
  const fecha = FechaContable.of(Number(anioStr), Number(mesStr), Number(diaStr));

  if (!horaParte) {
    return { fecha, hora: null };
  }
  const hora = horaParte.split(':').length === 2 ? `${horaParte}:00` : horaParte;
  return { fecha, hora };
}

export function leerFechaCelda(raw: string, dialecto: DialectoFecha): FechaLeida {
  switch (dialecto.tipo) {
    case 'SERIAL_EXCEL':
      return leerSerialExcel(raw);
    case 'TEXTO_ES_DD_MMM_YYYY':
      return leerTextoEs(raw);
    case 'DD_MM_YYYY':
      return leerDdMmYyyy(raw);
  }
}
