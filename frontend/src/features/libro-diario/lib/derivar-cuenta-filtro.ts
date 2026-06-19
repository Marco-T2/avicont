import type { Cuenta } from '@/types/api';

/** Separador entre código y nombre en la etiqueta del filtro de cuenta. */
const SEPARADOR = ' — ';

/**
 * Deriva la etiqueta de la cuenta por la que se filtró el Libro Diario, para
 * declararla en el encabezado de los exports (PDF/Excel).
 *
 * Sin `cuentaId` (informe completo) o cuenta ausente del catálogo → `undefined`:
 * el encabezado simplemente no muestra la línea de filtro.
 *
 * Se resuelve contra el catálogo de cuentas (no contra las líneas del informe)
 * porque un asiento que matchea el filtro trae TODAS sus líneas, no solo la de
 * la cuenta filtrada — derivar el nombre de la primera línea daría una cuenta
 * equivocada.
 */
export function derivarCuentaFiltroLabel(
  cuentaId: string | undefined,
  cuentas: readonly Cuenta[],
): string | undefined {
  if (cuentaId === undefined) return undefined;
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  if (cuenta === undefined) return undefined;
  return `${cuenta.codigoInterno}${SEPARADOR}${cuenta.nombre}`;
}
