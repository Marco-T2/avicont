/**
 * Dialecto Banco FIE XLSX (verificado célula por célula contra los 4 exports
 * reales: `fie-ultimas-transacciones.xlsx` y los tres `fie-por-rango-*.xlsx`).
 *
 * El export lo genera JasperReports (firma `JR_PAGE_ANCHOR` en el workbook) y
 * eso trae DOS particularidades que ningún otro perfil tenía:
 *
 *   1. Malformaciones del `.xlsx` (celdas `inlineStr` vacías sin `<is>` +
 *      `<dimension ref="A1"/>` mentiroso) que `read-excel-file` no tolera —
 *      las resuelve `sanear-xlsx-jasperreports.ts`, cableado universalmente en
 *      `leerMatrizXlsx`. No es dato de este dialecto.
 *   2. Paginación EMBEBIDA estilo hoja impresa: la cabecera de la tabla se
 *      repite en cada página y entre bloques hay una fila-marcador con el
 *      número de página — de ahí `paginacionEmbebida: true`, el único flag
 *      que este perfil estrena en el motor.
 *
 * Publica `Saldo Inicial` y `Saldo Final` en la cabecera (SIN dos puntos, a
 * diferencia de BCP) ⇒ `estrategiaChecksum: 'DECLARADO'`.
 *
 * La hora viene en columna propia (`Hora`, `'11:57:00'`) y llega como STRING —
 * verificado empíricamente: no es celda con formato de fecha de Excel.
 *
 * `Sucursal` queda FUERA de `columnasDescripcion` a propósito: es un código de
 * 2 letras que es función 1:1 de `Oficina/Canal` (`AGENCIA QUILLACOLLO`→`CB`,
 * `Banco FIE`→`SC`, `Fienet`→`Internet`, `OFICINA NACIONAL`→`LP`), así que no
 * discrimina un movimiento de otro y solo ensucia el hash de dedup. Mismo
 * criterio con que BCP excluyó `Lugar`.
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_FIE: DialectoXlsx = {
  perfil: PerfilExtracto.FIE_XLSX,
  banco: 'Banco FIE',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet FIE > Cuentas > Detalle de movimientos, elegí el rango de fechas y descargá el extracto en Excel (.xlsx).',
  estrategiaChecksum: 'DECLARADO',
  soportaContraparte: false,
  soportaHora: true,
  exponeNumeroCuenta: true,

  // La fila de encabezados de la tabla está en la 28 (1-based) — el bloque de
  // cabecera (titular, `NUMERO DE CUENTA:` en la fila 8, `Saldo Inicial` en la
  // 19 y `Saldo Final` en la 27) es el más alto de todos los perfiles.
  filasMaxEscaneoEncabezados: 35,
  filasMaxBloqueCabecera: 28,

  etiquetaFecha: 'Fecha',
  etiquetaHora: 'Hora',
  etiquetaReferencia: 'Referencia',
  mapeoMonto: { modo: 'COLUMNA_UNICA_CON_SIGNO', etiqueta: 'Monto' },
  etiquetaSaldo: 'Saldo Disponible',
  columnasDescripcion: ['Descripción', 'Oficina/Canal'],

  tipoCeldaFecha: 'TEXTO',
  dialectoFecha: { tipo: 'DD_MM_YYYY' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  numeroCuenta: { etiqueta: 'NUMERO DE CUENTA:' },
  etiquetasSaldoDeclarado: { inicial: 'Saldo Inicial', final: 'Saldo Final' },

  paginacionEmbebida: true,
};
