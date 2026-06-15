import { z } from 'zod';

// Schema espejo de la validación backend para el perfil fiscal de la organización.
// Todos los campos son strings (vacío = campo desmapeado → null en backend).
//
// La conversión '' → null ocurre en update-empresa.ts, no en el schema.
// El form trabaja con strings; el API layer convierte antes de enviar.
//
// Patrón: todos los campos son z.string() (sin .default() para evitar que zod
// infiera el tipo de INPUT como `string | undefined`). Los defaultValues del
// formulario se manejan en useForm() dentro del componente.

// Los 8 tipos de empresa habilitados por la norma boliviana (Ley 843).
// Espeja el enum TipoEmpresa del backend — cualquier cambio allá requiere actualizar acá.
const TIPOS_EMPRESA = [
  'COMERCIAL',
  'SERVICIOS',
  'TRANSPORTE',
  'INDUSTRIAL',
  'CONSTRUCCION',
  'PETROLERA',
  'AGROPECUARIA',
  'MINERA',
] as const;

export const empresaFormSchema = z.object({
  // Zod v4: error callback para mensaje personalizado en español.
  tipoEmpresaPrincipal: z.enum(TIPOS_EMPRESA, {
    error: () => 'Seleccioná un tipo de empresa válido',
  }),

  razonSocial: z.string().max(200, 'Máximo 200 caracteres'),

  // RND 10-0025-14: el NIT tiene entre 7 y 12 dígitos numéricos.
  // string vacío = campo no configurado (se convierte a null al enviar).
  nit: z
    .string()
    .refine(
      (val) => val === '' || /^\d{7,12}$/.test(val),
      'El NIT debe tener entre 7 y 12 dígitos',
    ),

  direccion: z.string().max(300, 'Máximo 300 caracteres'),

  representanteLegal: z.string().max(150, 'Máximo 150 caracteres'),

  telefono: z.string().max(30, 'Máximo 30 caracteres'),

  // string vacío = campo no configurado (se convierte a null al enviar).
  email: z
    .string()
    .refine(
      (val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Email inválido',
    ),
});

export type EmpresaFormValues = z.infer<typeof empresaFormSchema>;
