/**
 * Dialecto Unión XLSX (design §4.3.1/§4.5, verificado contra
 * `union-extracto-por-rango.xlsx`, hoja `ExtractoMovimientosFechas`, export
 * "por rango de fechas").
 *
 * `UNION_XLSX` NO comparte generador con BancoSol/Económico — columnas y
 * bloque de cabecera vienen de otra fuente por completo (`[1]Fecha
 * Movimiento [3]AG [7]Descripción [20]Nro Documento [25]Monto [29]Saldo` vs
 * `[0]Fecha [1]Hora [2]Nro Trn./Cheque [4]Transacción [8]Nota [11]Monto
 * [12]Saldo`). Es un `DialectoXlsx` PROPIO sobre el mismo motor
 * `XlsxCoreExtractoParser` — el mapeo por NOMBRE de columna (nunca por
 * índice) hace estructuralmente imposible reusar por accidente el mapeo de
 * los otros dos perfiles.
 *
 * No trae `Saldo Inicial:`/`Saldo Final:` en el bloque de cabecera —
 * `estrategiaChecksum: 'DERIVADO'` (el saldo inicial se deriva de la fila
 * más antigua, `domain/checksum-extracto.ts`). El archivo SÍ declara tres
 * totales al pie (Total Créditos / Total Débitos / Total-Disponible), pero
 * eso es verificación ADICIONAL que hacen los tests del adapter — no cambia
 * la clasificación de la estrategia (design §4.3.1, corrección CRITICAL-1).
 *
 * El otro export de Unión ("Últimos movimientos") queda descartado (sin
 * columna Saldo ⇒ checksum imposible, topado en 12 filas, índices de
 * columna DISTINTOS a los de este export) — de ahí la `advertencia`.
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_UNION_XLSX: DialectoXlsx = {
  perfil: PerfilExtracto.UNION_XLSX,
  banco: 'Banco Unión',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet Unión > Consultas > Extracto de Movimientos, elegí el rango de fechas (Desde/Hasta) y exportá a Excel (.xlsx).',
  advertencia:
    'Usá siempre el export "por rango de fechas". El export "Últimos movimientos" no trae columna de Saldo y no permite verificar el checksum.',
  estrategiaChecksum: 'DERIVADO',
  soportaContraparte: false,
  soportaHora: false,
  exponeNumeroCuenta: true,

  filasMaxEscaneoEncabezados: 30,
  filasMaxBloqueCabecera: 10,

  etiquetaFecha: 'Fecha Movimiento',
  etiquetaReferencia: 'Nro Documento',
  mapeoMonto: { modo: 'COLUMNA_UNICA_CON_SIGNO', etiqueta: 'Monto' },
  etiquetaSaldo: 'Saldo',
  columnasDescripcion: ['Descripción'],

  tipoCeldaFecha: 'TEXTO',
  dialectoFecha: { tipo: 'DD_MM_YYYY' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  numeroCuenta: { etiqueta: 'Cuenta:' },
};
