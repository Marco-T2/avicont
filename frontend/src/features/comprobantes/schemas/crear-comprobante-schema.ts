import { z } from 'zod';

import { lineaSchema } from './linea-schema';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Tolerancia de partida doble en BOB (CLAUDE.md §4.1).
const TOLERANCIA_BOB = 0.01;

// Tipos de comprobante — espejo de TipoComprobante de Prisma.
const TIPOS_COMPROBANTE = [
  'APERTURA',
  'DIARIO',
  'INGRESO',
  'EGRESO',
  'AJUSTE',
  'TRASPASO',
  'CIERRE',
] as const;

export const crearComprobanteSchema = z
  .object({
    tipo: z.enum(TIPOS_COMPROBANTE, { error: 'Tipo de comprobante inválido' }),

    fechaContable: z
      .string()
      .regex(ISO_DATE_REGEX, 'La fecha debe estar en formato YYYY-MM-DD'),

    glosa: z
      .string()
      .min(1, 'La glosa es obligatoria')
      .max(500, 'La glosa no puede superar 500 caracteres'),

    monedaPrincipal: z.enum(['BOB', 'USD']).optional(),

    lineas: z
      .array(lineaSchema)
      .min(1, 'Se requiere al menos 1 línea para crear un borrador'),
  })
  .superRefine((data, ctx) => {
    // Validación de partida doble tolerancia ±Bs 0.01 (CLAUDE.md §4.1).
    // Solo valida si hay al menos 2 líneas (1 línea es válida para guardar borrador).
    if (data.lineas.length < 2) return;

    let totalDebitoBob = 0;
    let totalCreditoBob = 0;

    for (const linea of data.lineas) {
      const deb = parseFloat(linea.debitoBob);
      const cred = parseFloat(linea.creditoBob);
      totalDebitoBob += isFinite(deb) ? deb : 0;
      totalCreditoBob += isFinite(cred) ? cred : 0;
    }

    const diff = Math.abs(totalDebitoBob - totalCreditoBob);
    if (diff > TOLERANCIA_BOB) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Los débitos no igualan a los créditos en BOB (diferencia: Bs ${diff.toFixed(2)})`,
        path: ['lineas'],
      });
    }
  });

export type CrearComprobanteValues = z.infer<typeof crearComprobanteSchema>;
