import { z } from 'zod';

// Espejo de la validación del backend: motivo no vacío de ≥20 caracteres
// (ver backend/src/periodos-fiscales/dto/reabrir-periodo.dto.ts y la
// excepción MotivoReaperturaInvalidoError). Trim antes de comparar para
// evitar el truco de "20 espacios".
export const reabrirPeriodoSchema = z.object({
  motivo: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(20, 'Mínimo 20 caracteres')),
});

export type ReabrirPeriodoValues = z.infer<typeof reabrirPeriodoSchema>;
