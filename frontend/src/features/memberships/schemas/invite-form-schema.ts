import { z } from 'zod';

export const inviteFormSchema = z
  .object({
    email: z
      .string()
      .min(1, 'El email es obligatorio')
      .email('Formato de email inválido'),
    roleKind: z.enum(['system', 'custom']),
    systemRole: z.enum(['OWNER', 'ADMIN']).optional(),
    customRoleId: z.string().uuid('Seleccioná un rol válido').optional(),
    expiresInDays: z.number().int().min(1).max(30),
  })
  // XOR: systemRole o customRoleId, no ambos.
  .refine(
    (v) =>
      v.roleKind === 'system'
        ? v.systemRole !== undefined
        : v.customRoleId !== undefined,
    {
      message: 'Seleccioná un rol (sistema o personalizado)',
      path: ['roleKind'],
    },
  );

export type InviteFormValues = z.infer<typeof inviteFormSchema>;
