import { z } from 'zod';

// §4.5: dinero y cantidades son STRING decimal — nunca number, nunca aritmética
// en el frontend. Decimal(18,6) → hasta 12 enteros y 6 decimales, punto decimal.
const DECIMAL_18_6_REGEX = /^\d{1,12}(\.\d{1,6})?$/;

// Cero en cualquier formato ('0', '0.0', '000') — la cantidad debe ser > 0.
const CERO_REGEX = /^0+(\.0+)?$/;

export const itemFormSchema = z.object({
  nombre: z
    .string()
    .min(1, 'El nombre es obligatorio')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  tipo: z.enum(['PRODUCTO', 'SERVICIO']),
  // Opcional (D-24): la conversión '' → null y la normalización (trim +
  // mayúsculas) las hace el backend / la capa api — el schema solo acota longitud.
  codigo: z.string().max(50, 'El código no puede superar 50 caracteres').default(''),
  unidadMedida: z
    .string()
    .max(20, 'La unidad de medida no puede superar 20 caracteres')
    .default(''),
  // Precio SUGERIDO: admite sub-centavo (precio por kg) y 0. Vacío = sin precio.
  precioUnitarioSugerido: z
    .string()
    .regex(
      DECIMAL_18_6_REGEX,
      'El precio debe ser un número con hasta 6 decimales (ej. 6.305)',
    )
    .or(z.literal(''))
    .default(''),
  cantidadPorDefecto: z
    .string()
    .min(1, 'La cantidad por defecto es obligatoria')
    .regex(
      DECIMAL_18_6_REGEX,
      'La cantidad debe ser un número con hasta 6 decimales (ej. 12)',
    )
    .refine((v) => !CERO_REGEX.test(v), 'La cantidad debe ser mayor a 0'),
  // '' = sin cuenta propia → al vender cae al concepto ventasId de la
  // configuración contable de la organización.
  cuentaIngresoId: z.string().default(''),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;
