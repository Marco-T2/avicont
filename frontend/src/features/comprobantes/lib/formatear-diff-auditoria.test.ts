import { describe, expect, it } from 'vitest';

import { formatearDiffAuditoria, type DiffEntry, type DiffLinea } from './formatear-diff-auditoria';

// Helper: en operaciones UPDATE, todas las entradas son DiffLinea — extraer
// `.campo` sin que TS se queje del union DiffEntry.
function camposDe(diffs: DiffEntry[]): string[] {
  return diffs.flatMap((d) => (d.tipo === 'campo' ? [d.campo] : []));
}

describe('formatearDiffAuditoria', () => {
  describe('INSERT', () => {
    it('retorna "Creado" para INSERT', () => {
      const result = formatearDiffAuditoria('INSERT', null, { glosa: 'Venta' });
      expect(result).toHaveLength(1);
      const first = result[0];
      if (first === undefined) throw new Error('expected at least 1 diff');
      expect(first.tipo).toBe('creado');
    });
  });

  describe('DELETE', () => {
    it('retorna "Eliminado" para DELETE', () => {
      const result = formatearDiffAuditoria('DELETE', { glosa: 'Venta' }, null);
      expect(result).toHaveLength(1);
      const first = result[0];
      if (first === undefined) throw new Error('expected at least 1 diff');
      expect(first.tipo).toBe('eliminado');
    });
  });

  describe('UPDATE', () => {
    it('detecta campos que cambiaron', () => {
      const rowOld = { glosa: 'Venta al contado', totalDebitoBob: '1000.00', updatedAt: '2026-04-22' };
      const rowNew = { glosa: 'Venta al por mayor', totalDebitoBob: '1000.00', updatedAt: '2026-04-23' };
      const diffs = formatearDiffAuditoria('UPDATE', rowOld, rowNew);
      const campos = camposDe(diffs);
      // glosa cambió → debe aparecer
      expect(campos).toContain('glosa');
      // updatedAt está en la blacklist → no debe aparecer
      expect(campos).not.toContain('updatedAt');
      // totalDebitoBob no cambió → no debe aparecer
      expect(campos).not.toContain('totalDebitoBob');
    });

    it('omite campos en la blacklist: createdAt, updatedAt, id', () => {
      const rowOld = { id: 'abc', createdAt: '2026-01-01', updatedAt: '2026-01-01', glosa: 'A' };
      const rowNew = { id: 'abc', createdAt: '2026-01-01', updatedAt: '2026-01-02', glosa: 'B' };
      const diffs = formatearDiffAuditoria('UPDATE', rowOld, rowNew);
      const campos = camposDe(diffs);
      expect(campos).not.toContain('id');
      expect(campos).not.toContain('createdAt');
      expect(campos).not.toContain('updatedAt');
      expect(campos).toContain('glosa');
    });

    it('retorna array vacío si nada cambió (fuera de blacklist)', () => {
      const rowOld = { glosa: 'igual', totalDebitoBob: '500.00' };
      const rowNew = { glosa: 'igual', totalDebitoBob: '500.00' };
      const diffs = formatearDiffAuditoria('UPDATE', rowOld, rowNew);
      expect(diffs).toHaveLength(0);
    });

    it('captura el antes y después correctamente', () => {
      const rowOld = { glosa: 'viejo' };
      const rowNew = { glosa: 'nuevo' };
      const diffs = formatearDiffAuditoria('UPDATE', rowOld, rowNew);
      const glosaEntry = diffs.find(
        (d): d is DiffLinea => d.tipo === 'campo' && d.campo === 'glosa',
      );
      if (!glosaEntry) throw new Error('expected glosa diff');
      expect(glosaEntry.antes).toBe('viejo');
      expect(glosaEntry.despues).toBe('nuevo');
    });

    it('maneja rowOld o rowNew como null (ambos tipos de operación)', () => {
      // UPDATE con null rowOld debería no crashear
      expect(() => formatearDiffAuditoria('UPDATE', null, { glosa: 'nuevo' })).not.toThrow();
    });
  });

  it('tipo desconocido retorna array vacío sin crashear', () => {
    expect(() => formatearDiffAuditoria('UNKNOWN', null, null)).not.toThrow();
    expect(formatearDiffAuditoria('UNKNOWN', null, null)).toEqual([]);
  });
});
