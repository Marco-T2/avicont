import { z } from 'zod';

// Schema espejo de la validación backend para el perfil fiscal de la organización.
// Todos los campos son opcionales: string vacío = campo desmapeado (null en backend).
//
// La conversión '' → null ocurre en update-empresa.ts, no en el schema.
// El form trabaja con strings vacíos; el API layer convierte antes de enviar.
export const empresaFormSchema = z.object({
  razonSocial: z.string().max(200, 'Máximo 200 caracteres').default(''),

  // RND 10-0025-14: el NIT tiene entre 7 y 12 dígitos numéricos.
  // string vacío = campo no configurado (permitido).
  nit: z
    .literal('')
    .or(z.string().regex(/^\d{7,12}$/, 'El NIT debe tener entre 7 y 12 dígitos'))
    .default(''),

  direccion: z.string().max(300, 'Máximo 300 caracteres').default(''),

  representanteLegal: z.string().max(150, 'Máximo 150 caracteres').default(''),

  telefono: z.string().max(30, 'Máximo 30 caracteres').default(''),

  // string vacío = campo no configurado (permitido).
  email: z.literal('').or(z.string().email('Email inválido')).default(''),
});

export type EmpresaFormValues = z.infer<typeof empresaFormSchema>;
