import { z } from 'zod';

// ============================================================
// Schema del filtro del Balance General (payload hacia el hook/api)
// ============================================================

/**
 * Filtro del Balance General que se pasa al hook de query.
 *
 * `fecha` (REQ-BG-01): fecha de corte YYYY-MM-DD, obligatoria.
 * `incluirAnulados` (REQ-BG-10): incluir comprobantes anulados (default false).
 *
 * `gestionId` se omite deliberadamente: el backend infiere la gestión que
 * contiene la fecha de corte (menos UI, decisión de producto).
 */
export const balanceGeneralFiltroSchema = z.object({
  // §4.6 CLAUDE.md: fecha calendario pura, sin hora ni UTC.
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  incluirAnulados: z.boolean(),
});

export type BalanceGeneralFiltroValues = z.infer<typeof balanceGeneralFiltroSchema>;
