import { z } from 'zod';

// Sincronizado con backend/src/custom-roles/dto/*.dto.ts.
// - slug: kebab-case 2-50, solo editable al crear.
// - name: 2-80.
// - description: opcional, máx 500.
// - permissions: al menos 1.
export const roleFormSchema = z.object({
  slug: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Formato kebab-case (ej: contador-junior)'),
  name: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(80, 'Máximo 80 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres').optional(),
  permissions: z
    .array(z.string())
    .min(1, 'Seleccioná al menos un permiso'),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;
