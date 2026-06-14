import { z } from 'zod';

import type { DocumentoFisicoDetalle } from '@/types/api';

// §4.5: monto como string decimal positivo, nunca cero, nunca number.
const MONTO_REGEX = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

// D7: espeja FORMATO_INVALIDO del backend — solo mayúsculas, dígitos, punto, guion, barra.
const NUMERO_REGEX = /^[A-Z0-9./-]+$/;

// Schema base sin condicionalidad de monto/moneda ni de numero.
// numero es opcional aquí porque la condicionalidad (requerido/auto) se maneja en buildFormSchema.
const base = z.object({
  tipoDocumentoFisicoId: z.string().uuid('Seleccioná un tipo de documento'),
  numero: z
    .string()
    .trim()
    .max(50, 'El número no puede superar 50 caracteres')
    .optional()
    .nullable(),
  fechaEmision: z.string().min(1, 'La fecha de emisión es requerida'),
  monto: z.string().trim().optional().nullable(),
  moneda: z.enum(['BOB', 'USD']).optional().nullable(),
  contactoId: z.string().uuid().optional().nullable(),
  glosa: z.string().max(500, 'La glosa no puede superar 500 caracteres').optional().nullable(),
});

/**
 * Factory dinámica: recrea el schema según las condiciones del tipo seleccionado.
 * Usar con useMemo(() => buildFormSchema(esTributario, esAutoNumerico), [esTributario, esAutoNumerico]).
 * D1: monto/moneda requeridos solo si tributario; campos ocultos si no.
 * D-AUTO: numero no requerido (y no debe enviarse) si el tipo tiene numeración automática.
 */
export function buildFormSchema(esTributario: boolean, esAutoNumerico = false) {
  return base.superRefine((v, ctx) => {
    // D-AUTO: si el tipo es automático, el backend asigna el número — no se valida aquí.
    if (!esAutoNumerico) {
      const numeroTrimmed = v.numero?.trim() ?? '';
      if (!numeroTrimmed) {
        ctx.addIssue({
          path: ['numero'],
          code: 'custom',
          message: 'El número es requerido',
        });
      } else if (!NUMERO_REGEX.test(numeroTrimmed)) {
        ctx.addIssue({
          path: ['numero'],
          code: 'custom',
          message: 'Solo letras mayúsculas, números, punto, guion y barra',
        });
      }
    }

    if (esTributario) {
      if (!v.monto || !MONTO_REGEX.test(v.monto)) {
        ctx.addIssue({
          path: ['monto'],
          code: 'custom',
          message: 'El monto es requerido y debe ser un decimal válido mayor a cero',
        });
      }
      if (!v.moneda) {
        ctx.addIssue({
          path: ['moneda'],
          code: 'custom',
          message: 'La moneda es requerida',
        });
      }
    }
  });
}

// Tipo derivado del schema — usa el shape del base para que sea estable.
export type DocumentoFisicoFormValues = z.infer<typeof base>;

export const DEFAULT_CREATE_VALUES: DocumentoFisicoFormValues = {
  tipoDocumentoFisicoId: '',
  numero: '',
  fechaEmision: '',
  monto: null,
  moneda: null,
  contactoId: null,
  glosa: null,
};

/**
 * Mapper para precargar el form en mode=edit.
 * D2: numero puede quedar disabled si hay CONTABILIZADO (manejado en el form).
 */
export function mapDetalleToFormValues(d: DocumentoFisicoDetalle): DocumentoFisicoFormValues {
  return {
    tipoDocumentoFisicoId: d.tipoDocumentoFisico.id,
    numero: d.numero,
    fechaEmision: d.fechaEmision,
    monto: d.monto,
    moneda: (d.moneda as 'BOB' | 'USD' | null) ?? null,
    contactoId: d.contacto?.id ?? null,
    glosa: d.glosa,
  };
}
