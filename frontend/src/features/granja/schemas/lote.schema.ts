import { z } from 'zod';

// Preprocesador para campos numéricos enteros enviados desde inputs HTML.
// valueAsNumber en un input vacío produce NaN; el preprocess lo convierte en
// undefined para que el mensaje de error del .min() sea el esperado.
const INT_POSITIVE = z.preprocess(
  (v) => (typeof v === 'number' && isNaN(v) ? undefined : v),
  z.number({
    error: 'La cantidad inicial debe ser al menos 1',
  })
    .int('La cantidad inicial debe ser un número entero')
    .min(1, 'La cantidad inicial debe ser al menos 1'),
);

export const loteSchema = z.object({
  /** int > 0, INMUTABLE tras crear */
  cantidadInicial: INT_POSITIVE,
  /** 'YYYY-MM-DD' requerido */
  fechaIngreso: z
    .string()
    .min(1, 'La fecha de ingreso es obligatoria')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD'),
  nombre: z.string().max(120, 'El nombre no puede superar los 120 caracteres').optional(),
  galpon: z.string().max(120, 'El galpón no puede superar los 120 caracteres').optional(),
  // El preprocesador convierte el string vacío '' (valor de un date input sin
  // rellenar) en undefined, para que el .optional() lo acepte sin error de regex.
  fechaEstimadaSaca: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD')
      .optional(),
  ),
  detalle: z.string().max(500, 'El detalle no puede superar los 500 caracteres').optional(),
});

export type LoteFormValues = z.infer<typeof loteSchema>;
