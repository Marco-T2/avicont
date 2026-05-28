import type { Moneda } from '@/types/api';

// Modo de visualización/edición del comprobante en el sheet.
// - 'nuevo': creando un borrador desde cero
// - 'borrador': editando un comprobante en estado BORRADOR
// - 'contabilizado': editando un comprobante en estado CONTABILIZADO
export type ComprobanteMode = 'nuevo' | 'borrador' | 'contabilizado';

// Valores de una línea en el formulario react-hook-form.
// Todos los montos son strings (CLAUDE.md §4.5 — decimales como string en HTTP).
// `_localKey` es un UUID local generado con crypto.randomUUID() al crear la fila
// en el cliente — no se envía al backend. Se usa como key de React para
// garantizar identidad estable del elemento DOM (Anti-F-06 CLAUDE.md frontend).
//
// `debitoBob`/`creditoBob` NO viven en el form — son derived state calculados
// inline desde `debito`/`credito`/`tipoCambio`. Se populan en el submit antes
// de mandar al backend. Esto evita que un `setValue('debitoBob', ...)` durante
// un keystroke regenere `field.id` del useFieldArray y desmonte el input.
export interface LineaFormValues {
  /** UUID local generado en cliente. NO se envía al backend. */
  _localKey: string;
  cuentaId: string;
  contactoId?: string;
  moneda: Moneda;
  debito: string;
  credito: string;
  tipoCambio: string;
  glosaLinea?: string;
}

// Línea vacía inicial para el LineasEditor.
export const LINEA_VACIA: Omit<LineaFormValues, '_localKey'> = {
  cuentaId: '',
  moneda: 'BOB',
  debito: '0',
  credito: '0',
  tipoCambio: '1',
  glosaLinea: '',
};
