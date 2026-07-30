import { z } from 'zod';

import { aCentavosSeguro } from '../lib/dinero-centavos';

// §4.5: el monto es string Decimal(18,2) de punta a punta — el input de texto
// se valida por forma y viaja al backend sin tocar. La comparación "> 0" se
// hace en centavos enteros, nunca con parseFloat.
const MONTO_MSG = 'Monto inválido: solo dígitos y hasta 2 decimales con punto (ej. 1250.50)';

export const cobroFormSchema = z.object({
  contactoId: z.string().min(1, 'Elegí el cliente'),
  // §4.6: fecha de calendario pura YYYY-MM-DD, sin hora ni zona.
  fechaContable: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
  monto: z
    .string()
    .min(1, 'El monto es obligatorio')
    .refine((v) => aCentavosSeguro(v) !== null, MONTO_MSG)
    .refine((v) => (aCentavosSeguro(v) ?? 0n) > 0n, 'El monto debe ser mayor a 0'),
  cuentaDestinoId: z.string().min(1, 'Elegí la cuenta destino del cobro'),
  glosa: z
    .string()
    .min(1, 'La glosa es obligatoria')
    .refine((v) => v.trim().length > 0, 'La glosa no puede ser solo espacios'),
});

export type CobroFormValues = z.infer<typeof cobroFormSchema>;
