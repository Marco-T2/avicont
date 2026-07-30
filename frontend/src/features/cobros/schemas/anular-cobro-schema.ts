import { z } from 'zod';

// Espejo de la validación §4.7 del backend: motivo con al menos 10 caracteres
// SIGNIFICATIVOS. El transform+pipe hace que "          " (10 espacios) falle
// en el cliente. Mismo patrón que anular-comprobante-schema.ts de comprobantes
// (no se importa cross-feature: §14.6 solo habilita hooks).
export const anularCobroSchema = z.object({
  motivo: z
    .string({ error: 'El motivo es obligatorio' })
    .transform((v) => v.trim())
    .pipe(
      z.string().min(10, 'El motivo debe tener al menos 10 caracteres significativos'),
    ),
});

export type AnularCobroValues = z.infer<typeof anularCobroSchema>;
