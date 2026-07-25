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

/**
 * De dónde sale el monto del movimiento y, sobre todo, de dónde sale su
 * `LadoBancario`. Dos familias de export, mutuamente excluyentes:
 *
 *   - `COLUMNA_UNICA_CON_SIGNO` (BancoSol, Económico, Unión, BCP): una sola
 *     columna de monto; el lado se deduce del SIGNO (`-` → DEBITO).
 *   - `DEBITO_CREDITO_SEPARADOS` (Fortaleza, BMSC): dos columnas; el lado lo
 *     determina CUÁL de las dos trae valor, y el signo de la celda se ignora
 *     por completo (los montos vienen positivos en ambas columnas).
 *
 * Es una unión discriminada y no dos campos opcionales a propósito: con
 * campos opcionales, un dialecto podría declarar ambos —o ninguno— y el
 * compilador lo dejaría pasar hasta que un extracto real reventara en
 * producción.
 */
export type MapeoMonto =
  | { readonly modo: 'COLUMNA_UNICA_CON_SIGNO'; readonly etiqueta: string }
  | {
      readonly modo: 'DEBITO_CREDITO_SEPARADOS';
      readonly etiquetaDebito: string;
      readonly etiquetaCredito: string;
    };

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
  readonly mapeoMonto: MapeoMonto;
  readonly etiquetaSaldo: string;
  /** Columnas que se concatenan (unidas por ' ') para formar `descripcion` — design §4.5 WARNING. */
  readonly columnasDescripcion: readonly string[];

  readonly tipoCeldaFecha: TipoCeldaFecha;
  readonly dialectoFecha: DialectoFecha;
  readonly dialectoMonto: DialectoMonto;

  readonly numeroCuenta: ExtraccionNumeroCuenta;
  /** Solo para `estrategiaChecksum === 'DECLARADO'` — etiquetas de saldo inicial/final en cabecera. */
  readonly etiquetasSaldoDeclarado?: { readonly inicial: string; readonly final: string };

  /**
   * `true` cuando el generador maqueta la planilla como hoja IMPRESA (FIE,
   * vía JasperReports): la cabecera de la tabla SE REPITE al inicio de cada
   * página y entre bloques aparece una fila-marcador con el número de página
   * en la columna Fecha. Con el flag activo, el motor DESCARTA esas dos
   * clases de fila por su ESTRUCTURA (nunca por posición: cuántas filas trae
   * cada página lo decide la plantilla del banco y puede cambiar sin aviso).
   * Los dos descartes co-ocurren siempre en un export paginado de Jasper —
   * un solo flag, no dos.
   */
  readonly paginacionEmbebida?: boolean;
}
