import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es obligatorio')
    .email('Formato de email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
