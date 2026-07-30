import { z } from 'zod';

// Espejo de la validación del backend (§4.7): motivo con al menos 10
// caracteres SIGNIFICATIVOS. El transform(trim) hace que "          "
// (10 espacios) reduzca a "" y falle el min(10) en el cliente.
// Mismo patrón que anular-comprobante-schema.ts de comprobantes.
export const anularVentaSchema = z.object({
  motivo: z
    .string({ error: 'El motivo es obligatorio' })
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(10, 'El motivo debe tener al menos 10 caracteres significativos'),
    ),
});

export type AnularVentaValues = z.infer<typeof anularVentaSchema>;
