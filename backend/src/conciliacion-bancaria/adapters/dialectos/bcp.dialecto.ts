/**
 * Dialecto BCP XLSX (design §4.3/§4.5, verificado contra `bcp-extracto.xlsx`,
 * export "Extracto de Cuenta por Mes").
 *
 * `BCP_XLSX` NO comparte generador con ninguno de los tres perfiles previos:
 * su bloque de cabecera usa etiquetas propias (`Nro. Cuenta:`, `Saldo
 * Inicial:`, `Saldo Final:`) y su tabla tiene columnas propias (`Fecha |
 * Hora | Descripción | Medio de Atención | Lugar | Monto | Saldo`). Es un
 * `DialectoXlsx` PROPIO sobre el mismo motor `XlsxCoreExtractoParser`.
 *
 * PRIMER perfil con `estrategiaChecksum: 'DECLARADO'` sobre este generador:
 * el archivo publica `Saldo Inicial:` y `Saldo Final:` en la cabecera, así
 * que el checksum NO se deriva de la fila más antigua sino que se contrasta
 * contra lo que el propio banco declara.
 *
 * Dos particularidades del formato, ambas resueltas como DATO del dialecto:
 *   - La fecha es un string compacto `20260701` sin separadores — de ahí el
 *     `DialectoFecha` `YYYYMMDD` (`parsing/fechas.ts`).
 *   - La celda de monto puede traer el ruido binario de un float
 *     (`4.6500000000000004`). No se toca acá: `leerMontoCelda` construye
 *     `Money.of(stringCrudo)` y `toBob()` lo resuelve a `'4.65'`, sin pasar
 *     nunca por `Number()` (CLAUDE.md §4.5).
 *
 * `Lugar` queda FUERA de `columnasDescripcion` a propósito: en el extracto
 * real es constante (`Agencia Central la Paz` en las 15 filas), así que no
 * discrimina un movimiento de otro y solo agregaría ruido a la descripción
 * que ve el contador y que entra al hash de dedup.
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_BCP: DialectoXlsx = {
  perfil: PerfilExtracto.BCP_XLSX,
  banco: 'Banco de Crédito BCP',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet BCP > Consultas > Extracto de Cuenta, elegí el mes y descargá el reporte en Excel (.xlsx).',
  estrategiaChecksum: 'DECLARADO',
  soportaContraparte: false,
  soportaHora: true,
  exponeNumeroCuenta: true,

  // El bloque de cabecera llega hasta `Fecha Consulta:` (fila 21 1-based) y
  // la fila de encabezados de la tabla está en la 24 — más abajo que en los
  // otros perfiles, por el bloque de logos/datos del titular.
  filasMaxEscaneoEncabezados: 30,
  filasMaxBloqueCabecera: 23,

  etiquetaFecha: 'Fecha',
  etiquetaHora: 'Hora',
  mapeoMonto: { modo: 'COLUMNA_UNICA_CON_SIGNO', etiqueta: 'Monto' },
  etiquetaSaldo: 'Saldo',
  columnasDescripcion: ['Descripción', 'Medio de Atención'],

  tipoCeldaFecha: 'TEXTO',
  dialectoFecha: { tipo: 'YYYYMMDD' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  numeroCuenta: { etiqueta: 'Nro. Cuenta:' },
  etiquetasSaldoDeclarado: { inicial: 'Saldo Inicial:', final: 'Saldo Final:' },
};
