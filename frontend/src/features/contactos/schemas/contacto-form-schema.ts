import { z } from 'zod';

export const contactoFormSchema = z
  .object({
    razonSocial: z
      .string()
      .min(2, 'La razón social debe tener al menos 2 caracteres')
      .max(200, 'La razón social no puede superar los 200 caracteres'),
    nombreComercial: z.string().default(''),
    // La conversión '' → null vive en la capa api, no acá.
    // El schema lo deja como string para que react-hook-form maneje el campo con valor vacío.
    documento: z.string().default(''),
    // Email opcional: acepta cadena vacía O email válido.
    // En zod v4 se usa .or(z.literal('')) porque z.string().email() rechaza ''.
    email: z.string().email('El email no tiene un formato válido').or(z.literal('')),
    telefono: z.string().default(''),
    direccion: z.string().default(''),
    esCliente: z.boolean().default(false),
    esProveedor: z.boolean().default(false),
  })
  .refine((data) => data.esCliente || data.esProveedor, {
    message: 'El contacto debe ser cliente, proveedor, o ambos',
    path: ['esCliente'],
  });

export type ContactoFormValues = z.infer<typeof contactoFormSchema>;
