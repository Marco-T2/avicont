import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal, formatearFechaCelda } from '@/lib/export-excel';
import type { Celda, ColumnaHoja } from '@/lib/export-excel';
import type { ComprobanteListItem } from '@/types/api';

const SEP = ' / ';

/**
 * Mapea una lista de comprobantes a la matriz de celdas para el Excel.
 *
 * Estructura del resultado:
 * 1. Filas de cabecera fiscal (armarCabeceraFiscal — tolera null por campo).
 * 2. Fila de encabezados de columna (9 columnas).
 * 3. Por cada comprobante: una fila de 9 celdas.
 *
 * §4.5: totalDebitoBob ya es string en el DTO — va como CeldaNumero SIN recalcular.
 * §4.6: fechaContable viene como ISO YYYY-MM-DD — va vía formatearFechaCelda sin UTC.
 * §4.7: anulado=true → "Anulado" en Estado; numero=null (BORRADOR) → celda vacía.
 */
export function mapearComprobantesAFilas(
  items: ComprobanteListItem[],
  perfil: EmpresaPerfil,
): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Cabecera fiscal (campos no-null del perfil)
  filas.push(...armarCabeceraFiscal(perfil));

  // 2. Fila de encabezados de columna
  filas.push([
    { type: 'texto', value: 'Fecha' },
    { type: 'texto', value: 'Número' },
    { type: 'texto', value: 'Tipo' },
    { type: 'texto', value: 'Documento respaldo' },
    { type: 'texto', value: 'Nro. Ref.' },
    { type: 'texto', value: 'Contacto' },
    { type: 'texto', value: 'Glosa' },
    { type: 'texto', value: 'Estado' },
    { type: 'texto', value: 'Total BOB' },
  ]);

  // 3. Filas de detalle: un comprobante por fila
  for (const c of items) {
    filas.push([
      { type: 'texto', value: formatearFechaCelda(c.fechaContable) },                    // §4.6
      { type: 'texto', value: c.numero ?? '' },                                           // §4.7 BORRADOR → vacío
      { type: 'texto', value: c.tipo },
      { type: 'texto', value: c.documentosRespaldo.map((d) => d.tipoNombre).join(SEP) },
      { type: 'texto', value: c.documentosRespaldo.map((d) => d.numero).join(SEP) },
      { type: 'texto', value: c.contactos.map((co) => co.nombre).join(SEP) },
      { type: 'texto', value: c.glosa },
      { type: 'texto', value: c.anulado ? 'Anulado' : c.estado },                        // §4.7
      { type: 'numero', value: c.totalDebitoBob },                                        // §4.5
    ]);
  }

  return filas;
}

/** Anchos de columna para construirHoja. */
export const COLUMNS_COMPROBANTES: ColumnaHoja[] = [
  { width: 14 }, // Fecha
  { width: 16 }, // Número
  { width: 12 }, // Tipo
  { width: 18 }, // Documento respaldo
  { width: 14 }, // Nro. Ref.
  { width: 28 }, // Contacto
  { width: 40 }, // Glosa
  { width: 14 }, // Estado
  { width: 16 }, // Total BOB
];
