import { z } from 'zod';

// Regex YYYY-MM-DD para fechas contables (§4.6 CLAUDE.md)
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const fechaContableZod = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(FECHA_REGEX, 'La fecha debe tener formato YYYY-MM-DD');

/**
 * Schema del formulario de filtros del Balance de Comprobación.
 *
 * Contrato simplificado: siempre rango de fechas (fechaDesde + fechaHasta).
 * El componente compartido `PeriodoGestionFiltro` resuelve cualquier preset
 * (gestión, mes, rango personalizado) a un `RangoFechas { fechaDesde, fechaHasta }`
 * antes de emitir. Ya no existe el modo 'periodo' con periodoFiscalId.
 *
 * `incluirAnulados` (REQ-BC-08) es opcional en el input (omitir = false). Esto
 * permite parsear payloads sin el campo (ej. tests, constructores de params) y
 * siempre devuelve boolean en el output via `.default(false)`.
 *
 * A diferencia del Libro Mayor, el Balance de Comprobación NO tiene `cuentaId`
 * ni `soloConMovimiento`: por definición lista TODAS las cuentas de detalle con
 * movimiento en el rango (REQ-BC-04).
 */
export const balanceComprobacionFiltroSchema = z
  .object({
    fechaDesde: fechaContableZod,
    fechaHasta: fechaContableZod,
    incluirAnulados: z.boolean().optional().default(false),
  })
  .refine((d) => d.fechaDesde <= d.fechaHasta, {
    message: 'La fecha de inicio no puede ser posterior a la fecha final',
    path: ['fechaHasta'],
  });

export type BalanceComprobacionFiltroValues = z.output<typeof balanceComprobacionFiltroSchema>;
