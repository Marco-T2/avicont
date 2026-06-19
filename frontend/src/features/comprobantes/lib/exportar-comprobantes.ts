import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import { armarCabeceraFiscal, formatearFechaCelda } from '@/lib/export-excel';
import type { Celda, ColumnaHoja } from '@/lib/export-excel';
import type { ColumnaPdf } from '@/lib/export-pdf';
import type { ComprobanteListItem } from '@/types/api';

const SEP = ' / ';

/**
 * Mapea una lista de comprobantes a la matriz de filas de DATOS (encabezados +
 * una fila por comprobante), SIN la cabecera fiscal.
 *
 * Es la fuente única compartida por Excel (que le antepone armarCabeceraFiscal)
 * y PDF (que pasa el perfil al builder).
 *
 * §4.5: totalDebitoBob ya es string en el DTO — va como CeldaNumero SIN recalcular.
 * §4.6: fechaContable viene como ISO YYYY-MM-DD — va vía formatearFechaCelda sin UTC.
 * §4.7: anulado=true → "Anulado" en Estado; numero=null (BORRADOR) → celda vacía.
 */
export function mapearComprobantesAFilasDatos(items: ComprobanteListItem[]): Celda[][] {
  const filas: Celda[][] = [];

  // 1. Fila de encabezados de columna — negrita para resaltar la estructura del informe
  filas.push([
    { type: 'texto', value: 'Fecha', fontWeight: 'bold' },
    { type: 'texto', value: 'Número', fontWeight: 'bold' },
    { type: 'texto', value: 'Tipo', fontWeight: 'bold' },
    { type: 'texto', value: 'Documento respaldo', fontWeight: 'bold' },
    { type: 'texto', value: 'Nro. Ref.', fontWeight: 'bold' },
    { type: 'texto', value: 'Contacto', fontWeight: 'bold' },
    { type: 'texto', value: 'Glosa', fontWeight: 'bold' },
    { type: 'texto', value: 'Estado', fontWeight: 'bold' },
    { type: 'texto', value: 'Total BOB', fontWeight: 'bold' },
  ]);

  // 2. Filas de detalle: un comprobante por fila
  for (const c of items) {
    filas.push([
      { type: 'texto', value: formatearFechaCelda(c.fechaContable) }, // §4.6
      { type: 'texto', value: c.numero ?? '' }, // §4.7 BORRADOR → vacío
      { type: 'texto', value: c.tipo },
      { type: 'texto', value: c.documentosRespaldo.map((d) => d.tipoNombre).join(SEP) },
      { type: 'texto', value: c.documentosRespaldo.map((d) => d.numero).join(SEP) },
      { type: 'texto', value: c.contactos.map((co) => co.nombre).join(SEP) },
      { type: 'texto', value: c.glosa },
      { type: 'texto', value: c.anulado ? 'Anulado' : c.estado }, // §4.7
      { type: 'numero', value: c.totalDebitoBob }, // §4.5
    ]);
  }

  return filas;
}

/**
 * Mapea una lista de comprobantes a la matriz Excel: cabecera fiscal ++ filas de
 * datos. Wrapper delgado (output byte-equivalente al anterior al refactor).
 */
export function mapearComprobantesAFilas(
  items: ComprobanteListItem[],
  perfil: EmpresaPerfil,
): Celda[][] {
  return [...armarCabeceraFiscal(perfil), ...mapearComprobantesAFilasDatos(items)];
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

/**
 * Columnas para el PDF del listado de comprobantes (flex = widths del Excel).
 * 9 columnas → orientación landscape (excede el ancho útil de A4 portrait).
 */
export const COLUMNAS_PDF_COMPROBANTES: ColumnaPdf[] = [
  { flex: 14 }, // Fecha
  { flex: 16 }, // Número
  { flex: 12 }, // Tipo
  { flex: 18 }, // Documento respaldo
  { flex: 14 }, // Nro. Ref.
  { flex: 28 }, // Contacto
  { flex: 40 }, // Glosa
  { flex: 14 }, // Estado
  { flex: 16 }, // Total BOB
];
