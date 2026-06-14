import type { Comprobante } from '@/types/api';

import type { CrearComprobanteValues } from '../schemas/crear-comprobante-schema';
import type { LineaFormValues } from '../types';

// Mapea un comprobante del backend a los valores del form.
// NO incluye debitoBob/creditoBob — son derived state que el LineaRow calcula
// inline desde debito × tipoCambio, y se vuelven a calcular en onSubmit antes
// de mandar al backend.
// No es determinística por crypto.randomUUID() (key estable de React para el
// useFieldArray); por eso vive en lib/ como mapper del feature, no como helper puro.
export function mapComprobanteAForm(
  comprobante: Comprobante,
): Omit<CrearComprobanteValues, 'lineas'> & { lineas: LineaFormValues[]; motivo?: string } {
  return {
    tipo: comprobante.tipo,
    fechaContable: comprobante.fechaContable,
    glosa: comprobante.glosa,
    // El backend siempre devuelve el T/C de re-expresión (default "1"). Se refleja
    // tal cual: "1" es claro ("sin re-expresión") y evita que el input arranque
    // vacío y mande "" a la validación zod, que exige un decimal positivo.
    tipoCambioReexpresion: comprobante.tipoCambioReexpresion,
    lineas: comprobante.lineas.map((l) => ({
      _localKey: crypto.randomUUID(),
      cuentaId: l.cuentaId,
      contactoId: l.contactoId ?? undefined,
      moneda: l.moneda,
      debito: l.debito,
      credito: l.credito,
      tipoCambio: l.tipoCambio,
      glosaLinea: l.glosaLinea ?? '',
    })),
  };
}
