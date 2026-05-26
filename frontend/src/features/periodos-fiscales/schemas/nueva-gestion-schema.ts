import { z } from 'zod';

// Espejo del rango que valida el backend: `[2000, currentYearLaPaz + 1]`.
// El frontend usa la hora del cliente — si está mal seteada el backend
// igual rechaza con `GESTION_YEAR_FUERA_DE_RANGO`. Defense en cliente solo
// para feedback inmediato; la autoridad sigue siendo el servidor.
export const nuevaGestionSchema = z.object({
  year: z
    .number({
      required_error: 'El año es obligatorio',
      invalid_type_error: 'El año es obligatorio',
    })
    .int('El año debe ser entero')
    .min(2000, 'El año debe ser 2000 o posterior')
    .refine(
      (y) => y <= new Date().getFullYear() + 1,
      'El año no puede pasar del año siguiente',
    ),
});

export type NuevaGestionValues = z.infer<typeof nuevaGestionSchema>;
