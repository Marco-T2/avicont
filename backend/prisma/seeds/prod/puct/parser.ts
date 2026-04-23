import * as XLSX from 'xlsx';
import * as path from 'node:path';
import type { ClaseCuenta, TipoEmpresa } from '@prisma/client';

// Parser del Plan Único de Cuentas Tributarias (PUCT) del SIN.
// Lee prisma/seeds/prod/puct/source/puct.xlsx y devuelve registros listos
// para upsertear en la tabla CatalogoPuct. Ver README.md de la fuente para
// la trazabilidad regulatoria.

export interface PuctRecord {
  codigo: string;        // ej "1.1.1.001"
  nivel: number;         // 1..4 (nivel 5 son plantillas y se ignoran)
  nombre: string;
  claseCuenta: ClaseCuenta;
  padre: string | null;  // codigo del padre (null en nivel 1)
  tiposEmpresa: TipoEmpresa[];
  versionPuct: string;
}

const RUTA_DEFAULT = path.join(__dirname, 'source', 'puct.xlsx');

// Mapeo header del xlsx → enum TipoEmpresa.
// El xlsx usa "CONSTRUCCIÓN" con tilde; el enum usa CONSTRUCCION.
const TIPOS_EMPRESA_HEADERS: Array<{ header: string; tipo: TipoEmpresa }> = [
  { header: 'COMERCIAL', tipo: 'COMERCIAL' },
  { header: 'SERVICIOS', tipo: 'SERVICIOS' },
  { header: 'TRANSPORTE', tipo: 'TRANSPORTE' },
  { header: 'INDUSTRIAL', tipo: 'INDUSTRIAL' },
  { header: 'PETROLERA', tipo: 'PETROLERA' },
  { header: 'CONSTRUCCIÓN', tipo: 'CONSTRUCCION' },
  { header: 'AGROPECUARIA', tipo: 'AGROPECUARIA' },
  { header: 'MINERA', tipo: 'MINERA' },
];

// La primera columna (clase) determina la ClaseCuenta.
// Mapeo según RND No 101800000004:
//   1 → ACTIVO, 2 → PASIVO, 3 → PATRIMONIO, 4 → INGRESO, 5 → EGRESO
const CLASE_POR_DIGITO: Record<string, ClaseCuenta> = {
  '1': 'ACTIVO',
  '2': 'PASIVO',
  '3': 'PATRIMONIO',
  '4': 'INGRESO',
  '5': 'EGRESO',
};

export interface ParserOptions {
  rutaArchivo?: string;
  versionPuct?: string;
}

// Lee el xlsx oficial y devuelve los registros importables (niveles 1-4).
// Filas con nombre "XXX" (plantillas del nivel 5) se descartan.
export function parsearPuct(options: ParserOptions = {}): PuctRecord[] {
  const ruta = options.rutaArchivo ?? RUTA_DEFAULT;
  const versionPuct = options.versionPuct ?? '2018-03';

  const wb = XLSX.readFile(ruta);
  const ws = wb.Sheets['PUCT'];
  if (!ws) {
    throw new Error(`Hoja "PUCT" no encontrada en ${ruta}`);
  }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
  if (filas.length < 2) {
    throw new Error('xlsx vacío o sin datos');
  }

  // Validar estructura del header.
  const header = filas[0];
  if (!Array.isArray(header)) throw new Error('Header inválido en xlsx');
  validarHeader(header);

  const records: PuctRecord[] = [];
  // Pila de padres por nivel: indices[nivel-1] = ultimo codigo conocido en ese nivel.
  // Permite construir el codigo padre cuando aparece un hijo.
  const padresPorNivel: (string | null)[] = [null, null, null, null];

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila.length === 0) continue;

    const nombre = celdaTexto(fila[5]);
    if (!nombre || nombre === 'XXX') continue;

    const segmentos = extraerSegmentos(fila);
    if (segmentos.length === 0) continue;

    const nivel = segmentos.length;
    if (nivel < 1 || nivel > 4) continue; // ignoramos nivel 5

    const codigo = segmentos.join('.');
    const claseDigito = segmentos[0]!;
    const claseCuenta = CLASE_POR_DIGITO[claseDigito];
    if (!claseCuenta) {
      throw new Error(
        `Fila ${i + 1}: dígito de clase desconocido "${claseDigito}" (esperado 1..5)`,
      );
    }

    const padre = nivel === 1 ? null : (padresPorNivel[nivel - 2] ?? null);

    const tiposEmpresa = extraerTiposEmpresa(fila);
    if (tiposEmpresa.length === 0) {
      // Una fila sin ningún tipo de empresa marcado es sospechosa pero no la
      // consideramos error: el SIN podría tenerla solo como agrupador interno.
      // La importamos igual con array vacío.
    }

    records.push({
      codigo,
      nivel,
      nombre,
      claseCuenta,
      padre,
      tiposEmpresa,
      versionPuct,
    });

    // Actualizar pila de padres: este codigo es padre del siguiente nivel.
    padresPorNivel[nivel - 1] = codigo;
    // Limpiar niveles inferiores (cuando bajamos a un nuevo subgrupo).
    for (let n = nivel; n < padresPorNivel.length; n++) {
      padresPorNivel[n] = null;
    }
  }

  return records;
}

// ---------- helpers ----------

function validarHeader(header: unknown[]): void {
  const esperados = ['C', 'G', 'SG', 'CP', 'CA', 'NOMBRE DE LA CUENTA'];
  for (let i = 0; i < esperados.length; i++) {
    const valor = celdaTexto(header[i]);
    if (valor.toUpperCase() !== esperados[i]) {
      throw new Error(
        `Header columna ${i} inválido: esperado "${esperados[i]}", encontrado "${valor}"`,
      );
    }
  }
  // Validar que las columnas de tipo empresa estén presentes.
  for (const { header: nombreEsperado } of TIPOS_EMPRESA_HEADERS) {
    const presente = header.some((c) => celdaTexto(c).toUpperCase() === nombreEsperado);
    if (!presente) {
      throw new Error(`Header del xlsx no contiene la columna "${nombreEsperado}"`);
    }
  }
}

// Extrae segmentos del codigo jerárquico desde las primeras 5 columnas (C, G, SG, CP, CA).
// Devuelve los segmentos NO-vacíos en orden, formateando consistente.
function extraerSegmentos(fila: unknown[]): string[] {
  const segmentos: string[] = [];
  for (let col = 0; col < 5; col++) {
    const valor = fila[col];
    if (valor === null || valor === undefined || valor === '') break;
    // El xlsx mezcla números (1, 2) y strings ("001", "002"). Normalizamos a string.
    const segmento = typeof valor === 'number' ? String(valor) : String(valor).trim();
    if (segmento === '') break;
    segmentos.push(segmento);
  }
  return segmentos;
}

// Extrae los tipos de empresa marcados con "X" en las columnas correspondientes.
// El xlsx tiene tipos de empresa desde la columna 6 (índice 6) en adelante.
function extraerTiposEmpresa(fila: unknown[]): TipoEmpresa[] {
  const tipos: TipoEmpresa[] = [];
  // Las columnas de tipo empresa empiezan en índice 6.
  for (let i = 0; i < TIPOS_EMPRESA_HEADERS.length; i++) {
    const valor = celdaTexto(fila[6 + i]);
    if (valor.toUpperCase() === 'X') {
      tipos.push(TIPOS_EMPRESA_HEADERS[i]!.tipo);
    }
  }
  return tipos;
}

function celdaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return String(valor).trim();
}
