import { z } from 'zod';

// Patrón decimal de dinero (§4.5 CLAUDE.md, frontend-contracts.md §Dinero como string)
const DECIMAL_STRING = z
  .string()
  .min(1, 'El monto es obligatorio')
  .regex(/^\d+(\.\d{1,2})?$/, 'El monto debe ser un número positivo con hasta 2 decimales (ej. 150.50)');

export const movimientoInversionSchema = z.object({
  /** BOB como string decimal, regex /^\d+(\.\d{1,2})?$/ */
  monto: DECIMAL_STRING,
  /** 'YYYY-MM-DD' */
  fecha: z
    .string()
    .min(1, 'La fecha es obligatoria')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD'),
  /** uuid del TipoRegistro de naturaleza INVERSION */
  tipoRegistroId: z
    .string()
    .min(1, 'El tipo de registro es obligatorio')
    .uuid('El tipo de registro debe ser un identificador válido'),
  detalle: z.string().max(500, 'El detalle no puede superar los 500 caracteres').optional(),
});

export type MovimientoInversionFormValues = z.infer<typeof movimientoInversionSchema>;
