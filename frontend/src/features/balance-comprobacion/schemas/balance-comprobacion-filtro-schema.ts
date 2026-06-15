import { z } from 'zod';

// Regex YYYY-MM-DD para fechas contables (§4.6 CLAUDE.md)
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const fechaContableZod = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(FECHA_REGEX, 'La fecha debe tener formato YYYY-MM-DD');

/**
 * Schema del formulario de filtros del Balance de Comprobación.
 *
 * REQ-BC-01: exactamente uno de los dos modos de rango (mutuamente excluyentes):
 * (a) modo: 'periodo' + periodoFiscalId  → el backend deriva el mes completo.
 * (b) modo: 'rango'   + fechaDesde + fechaHasta (fechaDesde ≤ fechaHasta).
 *
 * `incluirAnulados` (REQ-BC-08) es opcional en el input y resuelve a `false`.
 *
 * A diferencia del Libro Mayor, el Balance de Comprobación NO tiene `cuentaId`
 * ni `soloConMovimiento`: por definición lista TODAS las cuentas de detalle con
 * movimiento en el rango (REQ-BC-04). No son toggles.
 */
const togglesShape = {
  incluirAnulados: z.boolean().optional().default(false),
};

export const balanceComprobacionFiltroSchema = z.discriminatedUnion('modo', [
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
      message: 'La fecha de inicio no puede ser posterior al rango de fechas final',
      path: ['fechaHasta'],
    }),
]);

export type BalanceComprobacionFiltroValues = z.output<typeof balanceComprobacionFiltroSchema>;
