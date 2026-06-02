import { z } from 'zod';

// Espeja CreateFeatureFlagDto / UpdateFeatureFlagDto del backend
// (feature-flags/dto/feature-flag.dto.ts) + el VO FeatureFlagKey
// (domain/feature-flag-key.ts). La `key` valida el mismo patrón que el backend
// (defense in depth, UX honesta); `name` y `description` respetan los MaxLength.
// El form se usa para crear y editar: en edición la `key` es inmutable (se
// deshabilita el input), pero sigue presente en los values para no romper el
// schema. Mensajes en español.

// RND interna: misma regex que el backend (FeatureFlagKey VO + CreateFeatureFlagDto).
const FEATURE_FLAG_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

export const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'La clave es obligatoria')
    .max(100, 'Máximo 100 caracteres')
    .regex(
      FEATURE_FLAG_KEY_REGEX,
      'Solo minúsculas, debe empezar con letra y contener solo letras, números o guion bajo',
    ),
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(200, 'Máximo 200 caracteres'),
  description: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .optional(),
  enabled: z.boolean(),
});

export type FeatureFlagFormValues = z.infer<typeof featureFlagSchema>;

export const DEFAULT_FEATURE_FLAG_VALUES: FeatureFlagFormValues = {
  key: '',
  name: '',
  description: '',
  enabled: false,
};
