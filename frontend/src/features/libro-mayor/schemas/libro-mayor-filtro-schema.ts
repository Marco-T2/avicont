import { z } from 'zod';

// Regex YYYY-MM-DD para fechas contables (§4.6 CLAUDE.md)
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const fechaContableZod = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(FECHA_REGEX, 'La fecha debe tener formato YYYY-MM-DD');

/**
 * Schema del formulario de filtros del Libro Mayor.
 *
 * Contrato simplificado: siempre rango de fechas (fechaDesde + fechaHasta).
 * El componente compartido `PeriodoGestionFiltro` resuelve cualquier preset
 * (gestión, mes, rango personalizado) a un `RangoFechas { fechaDesde, fechaHasta }`
 * antes de emitir. Ya no existe el modo 'periodo' con periodoFiscalId.
 *
 * `incluirAnulados` (REQ-LM-03) y `soloConMovimiento` (REQ-LM-08) son opcionales
 * en el input y resuelven a sus defaults via `.default(...)`. `soloConMovimiento`
 * arranca en true: por defecto el Mayor muestra solo cuentas con movimiento en
 * el rango.
 *
 * `cuentaId` es opcional — UUID de cuenta de detalle para filtrar.
 */
export const libroMayorFiltroSchema = z
  .object({
    fechaDesde: fechaContableZod,
    fechaHasta: fechaContableZod,
    incluirAnulados: z.boolean().optional().default(false),
    soloConMovimiento: z.boolean().optional().default(true),
    /** UUID de cuenta de detalle. Si se pasa, filtra por esa cuenta. Sin validación UUID en el form — el backend valida @IsUUID. */
    cuentaId: z.string().uuid().optional(),
  })
  .refine((d) => d.fechaDesde <= d.fechaHasta, {
    message: 'La fecha de inicio no puede ser posterior al rango de fechas final',
    path: ['fechaHasta'],
  });

export type LibroMayorFiltroValues = z.output<typeof libroMayorFiltroSchema>;
