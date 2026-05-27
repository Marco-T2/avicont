import { z } from 'zod';

// Espejo de la validación del backend:
// - ComprobanteAnularMotivoInvalidoError: trim().length >= 10 (CLAUDE.md §4.7)
// - MotivoAnulacionRequeridoError: longitud mínima 10 en DTO
//
// Usar .transform(s => s.trim()).pipe(z.string().min(10, '...')) para que
// "          " (10 espacios) falle en el cliente — el trim() reduce a ""
// de longitud 0, que no pasa el min(10). (Pattern de reabrir-periodo-schema.ts)
export const anularComprobanteSchema = z.object({
  motivo: z
    .string({ error: 'El motivo es obligatorio' })
    .transform((v) => v.trim())
    .pipe(
      z.string().min(
        10,
        'El motivo debe tener al menos 10 caracteres significativos',
      ),
    ),
});

export type AnularComprobanteValues = z.infer<typeof anularComprobanteSchema>;
