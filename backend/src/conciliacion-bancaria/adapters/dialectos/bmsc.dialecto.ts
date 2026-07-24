/**
 * Dialecto Banco Mercantil Santa Cruz XLSX (verificado célula por célula
 * contra `bmsc-extracto.xlsx`, export "Detalle de movimientos").
 *
 * Segundo perfil con `mapeoMonto` en modo `DEBITO_CREDITO_SEPARADOS`, y el
 * más ancho de todos: 21 columnas, con `Débito`/`Crédito`/`Saldo` al final.
 * Que el mapeo sea por NOMBRE de columna y nunca por índice es lo que hace
 * que ese ancho sea irrelevante para el motor.
 *
 * La hora viene en columna propia (`Hora`, `'06:27:52'`), como en Económico —
 * no embebida en la celda de fecha como en Fortaleza.
 *
 * A diferencia de Fortaleza, el monto NO trae prefijo de moneda: la celda es
 * `'17,390.00'` pelada.
 *
 * `estrategiaChecksum: 'DERIVADO'`. El bloque de cabecera SÍ publica un
 * `Saldo:` (`'Bs 78,453.95'`), pero es el saldo VIGENTE al momento de emitir
 * el archivo, no el saldo final del rango consultado: tomarlo como saldo
 * declarado sería correcto solo cuando el rango termina hoy, y silenciosamente
 * incorrecto en cualquier consulta histórica. Se deriva de la fila más
 * antigua, como el resto de los perfiles DERIVADO.
 *
 * Sobre la contraparte: el export trae columnas que ningún otro perfil tiene
 * (`Nombre/Denominación Depositante`, `Nom.Destinatario`, `Doc.Depositante`).
 * Se decidió NO mapearlas a `contraparteNombre`/`contraparteDocumento` en
 * esta entrega — `soportaContraparte` queda en `false`, como en los demás
 * perfiles. Los nombres igual quedan visibles para el contador y siguen
 * alimentando el matching por texto del motor de sugerencias, porque entran a
 * `columnasDescripcion`. `Doc.Depositante` queda fuera por ser un número que
 * no aporta a la búsqueda textual y sí ensucia el hash de dedup.
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_BMSC: DialectoXlsx = {
  perfil: PerfilExtracto.BMSC_XLSX,
  banco: 'Banco Mercantil Santa Cruz',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet BMSC > Cuentas > Extracto de cuenta, elegí el rango de fechas y descargá el detalle de movimientos en Excel (.xlsx).',
  estrategiaChecksum: 'DERIVADO',
  soportaContraparte: false,
  soportaHora: true,
  exponeNumeroCuenta: true,

  // La fila de encabezados está en la 12 (1-based) — debajo del bloque de
  // titular/cuenta y de la línea con el rango consultado.
  filasMaxEscaneoEncabezados: 20,
  filasMaxBloqueCabecera: 11,

  etiquetaFecha: 'Fecha',
  etiquetaHora: 'Hora',
  etiquetaReferencia: 'Cod. Bca.',
  mapeoMonto: {
    modo: 'DEBITO_CREDITO_SEPARADOS',
    etiquetaDebito: 'Débito',
    etiquetaCredito: 'Crédito',
  },
  etiquetaSaldo: 'Saldo',
  columnasDescripcion: ['Descripción', 'Nombre/Denominación Depositante', 'Nom.Destinatario'],

  tipoCeldaFecha: 'TEXTO',
  dialectoFecha: { tipo: 'DD_MM_YYYY' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  numeroCuenta: { etiqueta: 'Nro de Cuenta:' },
};
