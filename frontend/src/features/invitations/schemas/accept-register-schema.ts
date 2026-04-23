import { z } from 'zod';

// Schema del form de registro + aceptación. Sincronizado con el DTO del
// backend (backend/src/invitations/dto/accept-and-register.dto.ts).
export const acceptRegisterSchema = z.object({
  displayName: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .max(128, 'Máximo 128 caracteres'),
});

export type AcceptRegisterFormValues = z.infer<typeof acceptRegisterSchema>;
