import { z } from 'zod';

import type { DocumentoFisicoDetalle } from '@/types/api';

// §4.5: monto como string decimal positivo, nunca cero, nunca number.
const MONTO_REGEX = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

// D7: espeja FORMATO_INVALIDO del backend — solo mayúsculas, dígitos, punto, guion, barra.
const NUMERO_REGEX = /^[A-Z0-9./-]+$/;

// Schema base sin condicionalidad de monto/moneda.
const base = z.object({
  tipoDocumentoFisicoId: z.string().uuid('Seleccioná un tipo de documento'),
  numero: z
    .string()
    .trim()
    .min(1, 'El número es requerido')
    .max(50, 'El número no puede superar 50 caracteres')
    .regex(NUMERO_REGEX, 'Solo letras mayúsculas, números, punto, guion y barra'),
  fechaEmision: z.string().min(1, 'La fecha de emisión es requerida'),
  monto: z.string().trim().optional().nullable(),
  moneda: z.enum(['BOB', 'USD']).optional().nullable(),
  contactoId: z.string().uuid().optional().nullable(),
  glosa: z.string().max(500, 'La glosa no puede superar 500 caracteres').optional().nullable(),
});

/**
 * Factory dinámica: recrea el schema según si el tipo seleccionado es tributario.
 * Usar con useMemo(() => buildFormSchema(esTributario), [esTributario]).
 * D1: monto/moneda requeridos solo si tributario; campos ocultos si no.
 */
export function buildFormSchema(esTributario: boolean) {
  return base.superRefine((v, ctx) => {
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
