/**
 * Dialecto BancoSol XLSX (design §4.3/§4.5, verificado contra
 * `bancosol-a-mayo-junio.xlsx` / `bancosol-20-movimientos-checksum.xlsx`).
 *
 * Comparte generador con Económico (mismas columnas/cabecera) — lo que
 * distingue estructuralmente a los dos es: (a) la celda `Fecha` es un `Date`
 * nativo aquí (formato numérico de Excel) vs texto en Económico
 * (`tipoCeldaFecha`, ver `xlsx-core-extracto-parser.ts`), y (b) NO trae
 * `Saldo Inicial:`/`Saldo Final:` en el bloque de cabecera (`DERIVADO`).
 */
import { PerfilExtracto } from '@prisma/client';

import type { DialectoXlsx } from './dialecto-xlsx';

export const DIALECTO_BANCOSOL: DialectoXlsx = {
  perfil: PerfilExtracto.BANCOSOL_XLSX,
  banco: 'Banco Sol',
  formato: 'Excel (.xlsx)',
  instruccionesDescarga:
    'Entrá a Banca por Internet BancoSol > Consultas > Extracto de Cuenta, elegí el rango de fechas y exportá a Excel (.xlsx).',
  estrategiaChecksum: 'DERIVADO',
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

  tipoCeldaFecha: 'DATE_EXCEL',
  dialectoFecha: { tipo: 'SERIAL_EXCEL' },
  dialectoMonto: { separadorMiles: ',', separadorDecimal: '.' },

  numeroCuenta: { etiqueta: 'Cuenta:' },
};
