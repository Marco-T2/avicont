import { z } from 'zod';

// Schema del form de alta self-service. Crea la cuenta del usuario Y su primera
// organización (queda OWNER). Sincronizado con RegisterDto (email, password,
// displayName) + CreateTenantDto (organizationName → name) del backend.
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es obligatorio')
    .email('Formato de email inválido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .max(128, 'Máximo 128 caracteres'),
  displayName: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
  organizationName: z
    .string()
    .trim()
    .min(1, 'El nombre de la organización es obligatorio')
    .max(100, 'Máximo 100 caracteres'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
