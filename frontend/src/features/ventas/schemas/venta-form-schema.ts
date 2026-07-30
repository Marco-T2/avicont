import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// §4.5: dinero y cantidades son STRING decimal — nunca number, nunca aritmética
// en el frontend. Decimal(18,6) → hasta 12 enteros y 6 decimales, punto decimal.
const DECIMAL_18_6_REGEX = /^\d{1,12}(\.\d{1,6})?$/;

// Cero en cualquier formato ('0', '0.0', '000') — la cantidad debe ser > 0.
const CERO_REGEX = /^0+(\.0+)?$/;

export const lineaVentaSchema = z.object({
  itemId: z.string().min(1, 'Elegí un ítem del catálogo'),
  // Snapshot editable por línea (D-28): se precarga del ítem pero el usuario
  // puede cambiarlo. Espejo del Length(1, 500) del backend.
  descripcion: z
    .string()
    .min(1, 'La descripción es obligatoria')
    .max(500, 'La descripción no puede superar 500 caracteres'),
  cantidad: z
    .string()
    .min(1, 'La cantidad es obligatoria')
    .regex(
      DECIMAL_18_6_REGEX,
      'La cantidad debe ser un número con hasta 6 decimales (ej. 5)',
    )
    .refine((v) => !CERO_REGEX.test(v), 'La cantidad debe ser mayor a 0'),
  // 0 permitido A PROPÓSITO: un ítem bonificado va con precio 0 — queda en el
  // documento sin emitir línea contable (REQ-VTA-04, SKIP-on-zero).
  precioUnitario: z
    .string()
    .min(1, 'El precio es obligatorio')
    .regex(
      DECIMAL_18_6_REGEX,
      'El precio debe ser un número con hasta 6 decimales (ej. 6.305)',
    ),
});

export type LineaVentaFormValues = z.infer<typeof lineaVentaSchema>;

/**
 * Schema del editor de venta (alta y edición — full-state, D-17).
 *
 * Reglas cruzadas (REQ-VTA-02 / REQ-VTA-04, espejo de lo que el backend
 * rechaza con VENTA_VENCIMIENTO_REQUERIDO / VENTA_CUENTA_DESTINO_NO_ELEGIBLE):
 * - CREDITO → `fechaVencimiento` OBLIGATORIA; la contrapartida es CxC y
 *   `cuentaDestinoId` se ignora.
 * - CONTADO → `fechaVencimiento` PROHIBIDA y `cuentaDestinoId` obligatoria
 *   (la cuenta de efectivo/equivalente donde ingresa el dinero, PA-1).
 */
export const ventaFormSchema = z
  .object({
    contactoId: z.string().min(1, 'El cliente es obligatorio'),
    fechaContable: z
      .string()
      .regex(ISO_DATE_REGEX, 'La fecha debe estar en formato YYYY-MM-DD'),
    condicionPago: z.enum(['CONTADO', 'CREDITO']),
    // '' = sin vencimiento. La obligatoriedad/prohibición es cruzada (superRefine).
    fechaVencimiento: z
      .string()
      .regex(ISO_DATE_REGEX, 'La fecha debe estar en formato YYYY-MM-DD')
      .or(z.literal('')),
    glosa: z
      .string()
      .min(1, 'La glosa es obligatoria')
      .max(500, 'La glosa no puede superar 500 caracteres'),
    // '' = sin cuenta. Solo obligatoria en CONTADO (superRefine).
    cuentaDestinoId: z.string(),
    lineas: z.array(lineaVentaSchema).min(1, 'La venta necesita al menos una línea'),
  })
  .superRefine((data, ctx) => {
    if (data.condicionPago === 'CREDITO' && data.fechaVencimiento === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaVencimiento'],
        message: 'La fecha de vencimiento es obligatoria en una venta a crédito',
      });
    }
    if (data.condicionPago === 'CONTADO' && data.fechaVencimiento !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaVencimiento'],
        message: 'Una venta al contado no lleva fecha de vencimiento',
      });
    }
    if (data.condicionPago === 'CONTADO' && data.cuentaDestinoId === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cuentaDestinoId'],
        message: 'Elegí la cuenta donde ingresa el dinero',
      });
    }
  });

export type VentaFormValues = z.infer<typeof ventaFormSchema>;
