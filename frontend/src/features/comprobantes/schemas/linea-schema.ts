import { z } from 'zod';

// Decimal no-negativo como string — espejo de DECIMAL_NO_NEG del backend DTO.
// Decimales cruzan HTTP como string (CLAUDE.md §4.5) — evita pérdida IEEE-754.
const DECIMAL_STRING = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Debe ser un número no negativo (ej. "1000.00")');

// Regex para UUID v4 — alineado con @IsUUID() del backend DTO.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const lineaSchema = z
  .object({
    cuentaId: z
      .string()
      .regex(UUID_REGEX, 'Debe ser un UUID válido'),

    contactoId: z.string().optional(),

    moneda: z.enum(['BOB', 'USD'], { error: 'Moneda debe ser BOB o USD' }),

    debito: DECIMAL_STRING,
    credito: DECIMAL_STRING,
    tipoCambio: DECIMAL_STRING,
    // debitoBob/creditoBob NO se trackean en el form — son derived state.
    // Se calculan inline en el render del LineaRow + se populan en el submit
    // antes de pasar al backend. Esto evita que `setValue('debitoBob', ...)`
    // dentro de un useEffect regenere `field.id` del useFieldArray durante
    // un keystroke, lo que causaba unmount/mount del input y pérdida de foco.

    glosaLinea: z.string().max(500, 'La glosa de línea no puede superar 500 caracteres').optional(),
  })
  .superRefine((data, ctx) => {
    const debito = parseFloat(data.debito);
    const credito = parseFloat(data.credito);
    const tipoCambio = parseFloat(data.tipoCambio);

    // Débito XOR crédito > 0 — no ambos, no ninguno (CLAUDE.md §4.1).
    const tieneDebito = isFinite(debito) && debito > 0;
    const tieneCredito = isFinite(credito) && credito > 0;

    if (tieneDebito && tieneCredito) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Una línea debe tener débito O crédito, no ambos a la vez',
        path: ['debito'],
      });
    }

    if (!tieneDebito && !tieneCredito) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La línea debe tener débito o crédito mayor a cero',
        path: ['debito'],
      });
    }

    // tipoCambio debe ser > 0
    if (!isFinite(tipoCambio) || tipoCambio <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El tipo de cambio debe ser mayor a cero',
        path: ['tipoCambio'],
      });
    }

    // Cuando moneda=BOB, tipoCambio debe ser exactamente "1" (CLAUDE.md §4.5)
    if (data.moneda === 'BOB' && data.tipoCambio !== '1') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Para moneda BOB el tipo de cambio debe ser 1',
        path: ['tipoCambio'],
      });
    }
  });

export type LineaValues = z.infer<typeof lineaSchema>;
