/**
 * Datos declarativos de un dialecto XLSX (design §4.3/§4.5/§8). Cada banco
 * soportado por `XlsxCoreExtractoParser` se reduce a UN objeto de este tipo —
 * "XLSX core-compartido": un motor, N dialectos.
 */
import type { PerfilExtracto } from '@prisma/client';

import type { DialectoFecha } from '../parsing/fechas';
import type { DialectoMonto } from '../parsing/dinero';
import type { EstrategiaChecksum } from '../../ports/extracto-parser.port';

/**
 * Cómo aislar y limpiar el número de cuenta de la cabecera (design §4.3).
 * El strip de prefijo/sufijo es DATO del dialecto, nunca lógica genérica —
 * si el prefijo/sufijo esperado no aparece, es error de formato del archivo,
 * NUNCA un strip silencioso.
 */
export interface ExtraccionNumeroCuenta {
  readonly etiqueta: string;
  readonly prefijoProducto?: string;
  readonly sufijoMoneda?: string;
}

/** Cómo distinguir la columna Fecha para discriminar entre dialectos que comparten generador (§8.2). */
export type TipoCeldaFecha = 'DATE_EXCEL' | 'TEXTO';

export interface DialectoXlsx {
  readonly perfil: PerfilExtracto;
  readonly banco: string;
  readonly formato: string;
  readonly instruccionesDescarga: string;
  readonly advertencia?: string;
  readonly estrategiaChecksum: EstrategiaChecksum;
  readonly soportaContraparte: boolean;
  readonly soportaHora: boolean;
  readonly exponeNumeroCuenta: boolean;

  /** Cuántas filas iniciales escanear buscando la fila de encabezados de la tabla. */
  readonly filasMaxEscaneoEncabezados: number;
  /** Cuántas filas iniciales escanear buscando pares etiqueta→valor del bloque de cabecera. */
  readonly filasMaxBloqueCabecera: number;

  /** Etiquetas de columna de la tabla de movimientos, tal como aparecen en el archivo. */
  readonly etiquetaFecha: string;
  readonly etiquetaHora?: string;
  readonly etiquetaReferencia?: string;
  readonly etiquetaMonto: string;
  readonly etiquetaSaldo: string;
  /** Columnas que se concatenan (unidas por ' ') para formar `descripcion` — design §4.5 WARNING. */
  readonly columnasDescripcion: readonly string[];

  readonly tipoCeldaFecha: TipoCeldaFecha;
  readonly dialectoFecha: DialectoFecha;
  readonly dialectoMonto: DialectoMonto;

  readonly numeroCuenta: ExtraccionNumeroCuenta;
  /** Solo para `estrategiaChecksum === 'DECLARADO'` — etiquetas de saldo inicial/final en cabecera. */
  readonly etiquetasSaldoDeclarado?: { readonly inicial: string; readonly final: string };
}
