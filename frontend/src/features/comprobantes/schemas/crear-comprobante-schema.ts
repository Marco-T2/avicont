import { z } from 'zod';

import { superRefinePartidaDoble } from '../lib/partida-doble';
import { lineaSchema } from './linea-schema';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Tipos de comprobante — espejo de TipoComprobante de Prisma.
const TIPOS_COMPROBANTE = [
  'APERTURA',
  'DIARIO',
  'INGRESO',
  'EGRESO',
  'AJUSTE',
  'TRASPASO',
  'CIERRE',
] as const;

// Valida un decimal positivo estricto (> 0). Espejo del DECIMAL_POSITIVE del backend.
const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

export const crearComprobanteSchema = z
  .object({
    tipo: z.enum(TIPOS_COMPROBANTE, { error: 'Tipo de comprobante inválido' }),

    fechaContable: z
      .string()
      .regex(ISO_DATE_REGEX, 'La fecha debe estar en formato YYYY-MM-DD'),

    glosa: z
      .string()
      .min(1, 'La glosa es obligatoria')
      .max(500, 'La glosa no puede superar 500 caracteres'),

    // monedaPrincipal no aparece como campo de UI — el payload hardcodea BOB.
    // Se omite del schema de creación.

    // T/C de re-expresión: campo de PRESENTACIÓN del encabezado (no afecta la
    // contabilidad). Permite al contador ver los totales en otra moneda en impresión.
    tipoCambioReexpresion: z
      .string()
      .regex(DECIMAL_POSITIVE, 'El T/C de re-expresión debe ser un número mayor a cero')
      .optional(),

    lineas: z
      .array(lineaSchema)
      .min(1, 'Se requiere al menos 1 línea para crear un borrador'),
  })
  .superRefine((data, ctx) => superRefinePartidaDoble(data.lineas, ctx));

export type CrearComprobanteValues = z.infer<typeof crearComprobanteSchema>;
