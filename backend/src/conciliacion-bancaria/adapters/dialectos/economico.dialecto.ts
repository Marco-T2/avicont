/**
 * Dialecto Económico XLSX (design §4.3/§4.5, CRITICAL-2, verificado contra
 * `economico-extracto.xlsx`).
 *
 * Mismo generador que BancoSol (columnas idénticas), pero: (a) la celda
 * `Fecha` es TEXTO `DD/Mmm/YYYY` (nunca `Date` nativo — señal estructural que
 * discrimina de BancoSol); (b) SÍ trae `Saldo Inicial:`/`Saldo Final:` en la
 * cabecera (`DECLARADO`); (c) el número de cuenta viene CONTAMINADO con
 * prefijo de producto `CA:` y sufijo de moneda `(Bs)` — `'CA: 6484254835 (Bs)'`
 * — que el dialecto strippea antes de devolver `numeroCuentaDeclarado`.
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_ECONOMICO: DialectoXlsx = {
  perfil: PerfilExtracto.ECONOMICO_XLSX,
  banco: 'Banco Económico',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet Económico > Consultas > Extracto de Cuenta, elegí el rango de fechas y exportá a Excel (.xlsx).',
  estrategiaChecksum: 'DECLARADO',
  soportaContraparte: false,
  soportaHora: true,
  exponeNumeroCuenta: true,

  filasMaxEscaneoEncabezados: 30,
  filasMaxBloqueCabecera: 10,

  etiquetaFecha: 'Fecha',
  etiquetaHora: 'Hora',
  etiquetaReferencia: 'Nro Trn./Cheque',
  etiquetaMonto: 'Monto',
  etiquetaSaldo: 'Saldo',
  columnasDescripcion: ['Transacción', 'Nota'],

  tipoCeldaFecha: 'TEXTO',
  dialectoFecha: { tipo: 'TEXTO_ES_DD_MMM_YYYY' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  // CRITICAL-2: etiqueta idéntica a BancoSol ('Cuenta:'), pero el VALOR viene
  // contaminado: 'CA: 6484254835 (Bs)'.
  numeroCuenta: { etiqueta: 'Cuenta:', prefijoProducto: 'CA:', sufijoMoneda: '(Bs)' },

  etiquetasSaldoDeclarado: { inicial: 'Saldo Inicial:', final: 'Saldo Final:' },
};
