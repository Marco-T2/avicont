import { TipoComprobante } from '@/common/domain/enums';

/**
 * Mapeo tipo → prefijo de 1 letra (ver `docs/disenos/comprobantes-asientos.md` §2).
 * Decisión intencional de diverger de avicont-ia (que usaba CD/CI/CE/CT/CA):
 * 1 letra es más legible en listados y más fácil de dictar.
 *
 * Las reglas de formato completas viven en el VO `NumeroComprobante`.
 * Este archivo queda sólo como lookup del prefijo, que el VO y los
 * reports consumen.
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
