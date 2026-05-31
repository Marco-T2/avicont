import { z } from 'zod';

// ============================================================
// Schema del filtro del Estado de Resultados (payload hacia el hook/api)
// ============================================================

/**
 * Filtro del Estado de Resultados que se pasa al hook de query.
 *
 * `fechaDesde`/`fechaHasta` (REQ-ER-01 forma 1): rango de flujo YYYY-MM-DD,
 * ambas obligatorias. El backend también acepta `periodoFiscalId` o `gestionId`,
 * pero la UI expone solo el rango de fechas (decisión de producto, consistente
 * con el Balance que omite el selector de gestión).
 * `incluirAnulados` (REQ-ER-04): incluir comprobantes anulados (default false).
 *
 * Como las fechas son YYYY-MM-DD, la comparación lexicográfica equivale al orden
 * cronológico — por eso `fechaDesde <= fechaHasta` valida el rango sin parsear.
 */
export const estadoResultadosFiltroSchema = z
  .object({
    // §4.6 CLAUDE.md: fecha calendario pura, sin hora ni UTC.
    fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    incluirAnulados: z.boolean(),
  })
  .refine((v) => v.fechaDesde <= v.fechaHasta, {
    message: 'La fecha desde debe ser anterior o igual a la fecha hasta',
    path: ['fechaHasta'],
  });

export type EstadoResultadosFiltroValues = z.infer<typeof estadoResultadosFiltroSchema>;
