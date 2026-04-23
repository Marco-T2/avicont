import { z } from 'zod';

// Sincronizado con backend/src/impersonation/dto/start-impersonation.dto.ts.
export const impersonateSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'La razón debe tener al menos 10 caracteres')
    .max(500, 'Máximo 500 caracteres'),
});

export type ImpersonateFormValues = z.infer<typeof impersonateSchema>;
