import { z } from 'zod';

// Regex YYYY-MM-DD para fechas contables (§4.6 CLAUDE.md)
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const fechaContableZod = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(FECHA_REGEX, 'La fecha debe tener formato YYYY-MM-DD');

/**
 * Schema del formulario de filtros del Estado de Flujo de Efectivo (EFE).
 *
 * Dos modos mutuamente excluyentes:
 * (a) modo: 'periodo' + periodoFiscalId → el backend deriva el mes completo.
 * (b) modo: 'rango'   + fechaDesde + fechaHasta (fechaDesde ≤ fechaHasta).
 *
 * Sin `gestionId` — el endpoint del EFE no lo expone (a diferencia del EEPN).
 * `incluirAnulados` es opcional en el input y resuelve a `false`.
 */
const togglesShape = {
  incluirAnulados: z.boolean().optional().default(false),
};

export const flujoEfectivoFiltroSchema = z.discriminatedUnion('modo', [
  z.object({
    modo: z.literal('periodo'),
    periodoFiscalId: z.string().min(1, 'El período fiscal es obligatorio'),
    ...togglesShape,
  }),
  z
    .object({
      modo: z.literal('rango'),
      fechaDesde: fechaContableZod,
      fechaHasta: fechaContableZod,
      ...togglesShape,
    })
    .refine((d) => d.fechaDesde <= d.fechaHasta, {
      message: 'La fecha de inicio no puede ser posterior a la fecha final',
      path: ['fechaHasta'],
    }),
]);

export type FlujoEfectivoFiltroValues = z.output<typeof flujoEfectivoFiltroSchema>;
