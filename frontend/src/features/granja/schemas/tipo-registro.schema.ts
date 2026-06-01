import { z } from 'zod';

export const tipoRegistroSchema = z.object({
  nombre: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'El nombre no puede superar los 100 caracteres'),
  naturaleza: z.enum(['INVERSION', 'CANTIDAD'], {
    error: 'La naturaleza debe ser INVERSION o CANTIDAD',
  }),
});

export type TipoRegistroFormValues = z.infer<typeof tipoRegistroSchema>;
