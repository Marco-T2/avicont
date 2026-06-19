import { formatearFechaCelda } from '@/lib/export-excel';
import type { LibroDiarioResponse } from '@/types/api';

/**
 * Modelo PURO del Libro Diario para el PDF agrupado por comprobante.
 *
 * A diferencia del Excel (matriz plana de filas), el Libro Diario en PDF se
 * presenta como el contador boliviano lo reconoce: agrupado por comprobante
 * (asiento), con su encabezado (tipo + número + fecha), sus líneas, su subtotal
 * y UNA glosa por comprobante. Este modelo es serializable y testeable: NO
 * arrastra @react-pdf/renderer. El renderer (construir-libro-diario-pdf) lo consume.
 *
 * §4.5: los montos viajan como string crudo del backend; el formateo de
 * presentación ocurre en el render, NUNCA se suman ni recalculan en el cliente.
 * §4.6: la fecha se formatea vía formatearFechaCelda (sin Date/UTC).
 */
export interface FilaAsientoPdf {
  codigo: string;
  nombre: string;
  /** Monto debe en BOB como string crudo del backend. */
  debe: string;
  /** Monto haber en BOB como string crudo del backend. */
  haber: string;
}

export interface AsientoPdf {
  /** Etiqueta user-facing del tipo (ej. "Egreso"). */
  tipoLabel: string;
  /** Número correlativo o placeholder si el asiento aún no fue contabilizado. */
  numero: string;
  /** Fecha contable formateada dd/mm/yyyy (§4.6). */
  fecha: string;
  anulado: boolean;
  filas: FilaAsientoPdf[];
  /** Subtotal debe del comprobante (del backend, §4.5). */
  totalDebe: string;
  /** Subtotal haber del comprobante (del backend, §4.5). */
  totalHaber: string;
  /** Glosa única del comprobante. */
  glosa: string;
}

export interface LibroDiarioPdfModelo {
  asientos: AsientoPdf[];
  /** Total general debe (del backend, §4.5). */
  totalDebe: string;
  /** Total general haber (del backend, §4.5). */
  totalHaber: string;
}

/**
 * Etiquetas user-facing de los tipos de comprobante (§1: "asiento" es vocabulario
 * de dominio user-facing). Espeja el enum TipoComprobante del backend.
 */
const ETIQUETAS_TIPO_COMPROBANTE: Readonly<Record<string, string>> = {
  APERTURA: 'Apertura',
  DIARIO: 'Diario',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  AJUSTE: 'Ajuste',
  TRASPASO: 'Traspaso',
  CIERRE: 'Cierre',
};

/** Placeholder para el número de un asiento sin contabilizar (numero === null). */
const SIN_NUMERO = '—';

/** Traduce el tipo del backend a su etiqueta user-facing; ante uno desconocido, lo deja crudo. */
export function etiquetaTipoComprobante(tipo: string): string {
  return ETIQUETAS_TIPO_COMPROBANTE[tipo] ?? tipo;
}

/**
 * Mapea la respuesta del Libro Diario al modelo PDF agrupado por comprobante.
 *
 * Los subtotales por asiento y el total general vienen ya computados del backend
 * (Decimal-safe); el cliente solo maqueta (§4.5).
 */
export function mapearLibroDiarioADocumentoPdf(
  response: LibroDiarioResponse,
): LibroDiarioPdfModelo {
  const asientos: AsientoPdf[] = response.asientos.map((asiento) => ({
    tipoLabel: etiquetaTipoComprobante(asiento.tipo),
    numero: asiento.numero ?? SIN_NUMERO,
    fecha: formatearFechaCelda(asiento.fechaContable),
    anulado: asiento.anulado,
    filas: asiento.lineas.map((linea) => ({
      codigo: linea.codigoCuenta,
      nombre: linea.nombreCuenta,
      debe: linea.debeBob,
      haber: linea.haberBob,
    })),
    totalDebe: asiento.totalDebeBob,
    totalHaber: asiento.totalHaberBob,
    glosa: asiento.glosa,
  }));

  return {
    asientos,
    totalDebe: response.totalDebeBob,
    totalHaber: response.totalHaberBob,
  };
}
