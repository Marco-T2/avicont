// Campos de auditoría técnica que no aportan valor al diff visual.
// Estos campos cambian en casi todo UPDATE (ruido) y son irrelevantes
// para el contador que revisa el historial.
const CAMPOS_BLACKLIST = new Set(['id', 'createdAt', 'updatedAt']);

export interface DiffLinea {
  tipo: 'campo';
  campo: string;
  antes: unknown;
  despues: unknown;
}

export interface DiffCreado {
  tipo: 'creado';
  row: unknown;
}

export interface DiffEliminado {
  tipo: 'eliminado';
  row: unknown;
}

export type DiffEntry = DiffLinea | DiffCreado | DiffEliminado;

/**
 * Transforma los campos `rowOld` y `rowNew` de una entrada de auditoría
 * en una lista de cambios visibles para el usuario.
 *
 * Reglas:
 * - INSERT → entrada única tipo 'creado' con el row completo.
 * - DELETE → entrada única tipo 'eliminado' con el row completo.
 * - UPDATE → compara campo a campo; omite los que no cambiaron y los de
 *   la blacklist (id, createdAt, updatedAt).
 * - rowOld o rowNew null en UPDATE → se trata como objeto vacío.
 * - Tipo desconocido → array vacío.
 */
export function formatearDiffAuditoria(
  operation: string,
  rowOld: unknown,
  rowNew: unknown,
): DiffEntry[] {
  if (operation === 'INSERT') {
    return [{ tipo: 'creado', row: rowNew }];
  }

  if (operation === 'DELETE') {
    return [{ tipo: 'eliminado', row: rowOld }];
  }

  if (operation === 'UPDATE') {
    const oldObj = isRecord(rowOld) ? rowOld : {};
    const newObj = isRecord(rowNew) ? rowNew : {};

    // Usar las claves del nuevo registro para recorrer
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    const diffs: DiffLinea[] = [];

    for (const key of allKeys) {
      if (CAMPOS_BLACKLIST.has(key)) continue;

      const antes = oldObj[key];
      const despues = newObj[key];

      // Solo incluir si el valor cambió
      if (antes !== despues) {
        diffs.push({ tipo: 'campo', campo: key, antes, despues });
      }
    }

    return diffs;
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
