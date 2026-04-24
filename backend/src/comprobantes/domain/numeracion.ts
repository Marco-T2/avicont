import { TipoComprobante } from '@prisma/client';

/**
 * Mapeo tipo → prefijo de 1 letra (CLAUDE.md §2 `docs/disenos/comprobantes-asientos.md`).
 * Decisión intencional de diverger de avicont-ia (que usaba CD/CI/CE/CT/CA):
 * 1 letra es más legible en listados y más fácil de dictar.
 */
export const PREFIJO_POR_TIPO: Record<TipoComprobante, string> = {
  APERTURA: 'A',
  DIARIO: 'D',
  INGRESO: 'I',
  EGRESO: 'E',
  AJUSTE: 'J',
  TRASPASO: 'T',
  CIERRE: 'C',
};

/**
 * Formatea un número de comprobante como `{prefijo}{YY}{MM}-{correlativo:6}`.
 * Ejemplo: formatearNumero(INGRESO, 2026, 4, 42) === "I2604-000042".
 *
 * - `year` se toma los últimos 2 dígitos (soporta 1900-2999).
 * - `month` con padding de cero a 2 dígitos.
 * - `correlativo` con padding de cero a 6 dígitos (suficiente para ~1M
 *   comprobantes del mismo tipo en un mes — holgado).
 */
export function formatearNumero(
  tipo: TipoComprobante,
  year: number,
  month: number,
  correlativo: number,
): string {
  const prefijo = PREFIJO_POR_TIPO[tipo];
  const yy = String(year).padStart(4, '0').slice(-2);
  const mm = String(month).padStart(2, '0');
  const corr = String(correlativo).padStart(6, '0');
  return `${prefijo}${yy}${mm}-${corr}`;
}
