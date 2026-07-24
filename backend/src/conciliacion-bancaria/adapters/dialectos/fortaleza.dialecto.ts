/**
 * Dialecto Banco Fortaleza XLSX (verificado célula por célula contra los dos
 * exports reales: `fortaleza-por-rango.xlsx` y `fortaleza-ultimos-30.xlsx`).
 *
 * PRIMER perfil con `mapeoMonto` en modo `DEBITO_CREDITO_SEPARADOS`: el
 * archivo trae columnas `Débito` y `Crédito` distintas, exactamente una con
 * valor por fila, y los montos vienen SIEMPRE positivos en ambas. El lado del
 * movimiento sale de la columna, nunca del signo.
 *
 * Los DOS exports del banco ("Últimos 30 movimientos" y "Movimientos del: X
 * al: Y") comparten fila de encabezados, bloque de cabecera y formatos —
 * verificado, no asumido. Un único dialecto cubre ambos, así que no hace
 * falta `advertencia` para empujar a uno u otro (a diferencia de Unión, donde
 * el export corto no trae columna Saldo y hace imposible el checksum). Lo
 * único que cambia entre ellos es el orden de las filas (DESC en el corto,
 * ASC en el de rango), y el motor no depende del orden.
 *
 * El monto trae prefijo de moneda (`'Bs.  16,000.00'`): lo resuelve
 * `PREFIJO_MONEDA_REGEX` en `parsing/dinero.ts`, sin pasar nunca por
 * `Number()` (CLAUDE.md §4.5).
 *
 * La fecha trae la hora embebida en la MISMA celda (`'22/07/2026 09:01'`) —
 * el dialecto `DD_MM_YYYY` ya la separa y normaliza a `'09:01:00'`, de ahí
 * que no exista columna `Hora` y `soportaHora` siga siendo `true`.
 *
 * No publica saldo inicial/final en la cabecera ⇒ `estrategiaChecksum:
 * 'DERIVADO'` (el saldo inicial se deriva de la fila más antigua, ver
 * `domain/checksum-extracto.ts`).
 *
 * `Agencia` queda FUERA de `columnasDescripcion` por el mismo criterio que
 * `Lugar` en BCP: en los extractos reales es prácticamente constante
 * (`AGENCIA CRUCE VILLA ADELA` en casi todas las filas), así que no
 * discrimina un movimiento de otro y solo mete ruido en la descripción que ve
 * el contador y en el hash de dedup.
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_FORTALEZA: DialectoXlsx = {
  perfil: PerfilExtracto.FORTALEZA_XLSX,
  banco: 'Banco Fortaleza',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet Fortaleza > Consultas > Extracto de Cuenta, elegí el rango de fechas y descargá el reporte de movimientos en Excel (.xlsx).',
  estrategiaChecksum: 'DERIVADO',
  soportaContraparte: false,
  soportaHora: true,
  exponeNumeroCuenta: true,

  // La fila de encabezados está en la 8 (1-based); el bloque de cabecera
  // (nombre, número de cuenta, tipo de producto) llega hasta la 6.
  filasMaxEscaneoEncabezados: 20,
  filasMaxBloqueCabecera: 7,

  etiquetaFecha: 'Fecha',
  etiquetaReferencia: 'Nro. Transacción',
  mapeoMonto: {
    modo: 'DEBITO_CREDITO_SEPARADOS',
    etiquetaDebito: 'Débito',
    etiquetaCredito: 'Crédito',
  },
  etiquetaSaldo: 'Saldo',
  columnasDescripcion: ['Tipo', 'Glosa'],

  tipoCeldaFecha: 'TEXTO',
  dialectoFecha: { tipo: 'DD_MM_YYYY' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  numeroCuenta: { etiqueta: 'NÚMERO DE CUENTA:' },
};
