import { z } from 'zod';

import type { ModuloOrganizacion } from '@/types/api';

// Opciones del selector de módulo de la nueva org. El value viaja al backend
// (CreateOrgDto.modulo); el label es el texto en español de la UI.
export const MODULOS_ORGANIZACION = [
  { value: 'CONTABILIDAD', label: 'Contabilidad' },
  { value: 'GRANJA', label: 'Granja' },
  { value: 'OTROS', label: 'Otros' },
] as const satisfies readonly { value: ModuloOrganizacion; label: string }[];

// Espeja CreateOrgDto del backend (name ≤100 no vacío, modulo enum, ownerEmail email).
// El ownerEmail debe ser un usuario ya registrado; el backend lo valida (422).
export const createOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'Máximo 100 caracteres'),
  modulo: z.enum(['CONTABILIDAD', 'GRANJA', 'OTROS'] as const),
  ownerEmail: z
    .string()
    .min(1, 'El email del responsable es obligatorio')
    .email('Formato de email inválido'),
});

export type CreateOrgFormValues = z.infer<typeof createOrgSchema>;

export const DEFAULT_CREATE_ORG_VALUES: CreateOrgFormValues = {
  name: '',
  modulo: 'CONTABILIDAD',
  ownerEmail: '',
};
