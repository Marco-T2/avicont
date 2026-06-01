import { z } from 'zod';

// Preprocesador para campos numéricos enteros enviados desde inputs HTML.
// valueAsNumber en un input vacío produce NaN; el preprocess lo convierte en
// undefined para que el mensaje de error del .min() sea el esperado.
const INT_MIN_1 = z.preprocess(
  (v) => (typeof v === 'number' && isNaN(v) ? undefined : v),
  z.number({
    error: 'La cantidad debe ser al menos 1',
  })
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser al menos 1'),
);

export const movimientoCantidadSchema = z.object({
  /** int >= 1 (mortalidad u otro movimiento de cantidad) */
  cantidad: INT_MIN_1,
  /** 'YYYY-MM-DD' */
  fecha: z
    .string()
    .min(1, 'La fecha es obligatoria')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD'),
  /** uuid del TipoRegistro de naturaleza CANTIDAD */
  tipoRegistroId: z
    .string()
    .min(1, 'El tipo de registro es obligatorio')
    .uuid('El tipo de registro debe ser un identificador válido'),
  detalle: z.string().max(500, 'El detalle no puede superar los 500 caracteres').optional(),
});

export type MovimientoCantidadFormValues = z.infer<typeof movimientoCantidadSchema>;
