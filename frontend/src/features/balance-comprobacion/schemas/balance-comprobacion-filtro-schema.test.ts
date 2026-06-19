import { describe, expect, it } from 'vitest';

import { balanceComprobacionFiltroSchema } from './balance-comprobacion-filtro-schema';

// Contrato simplificado: siempre rango de fechas (fechaDesde + fechaHasta).
// No hay más discriminante 'modo' ni periodoFiscalId.
describe('balanceComprobacionFiltroSchema', () => {
  describe('rango de fechas válido', () => {
    it('acepta fechaDesde + fechaHasta válidas', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
    });

    it('acepta fechaDesde === fechaHasta (mismo día)', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '2026-05-15',
        fechaHasta: '2026-05-15',
      });
      expect(r.success).toBe(true);
    });

    it('rechaza fechaDesde > fechaHasta', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '2026-05-31',
        fechaHasta: '2026-01-01',
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const msgs = r.error.issues.map((i) => i.message).join(' ');
        expect(msgs.toLowerCase()).toMatch(/fecha|rango/);
      }
    });

    it('rechaza sin fechaDesde', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza sin fechaHasta', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza formato de fecha incorrecto', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '01/01/2026',
        fechaHasta: '31/03/2026',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('incluirAnulados', () => {
    it('acepta toggle incluirAnulados: true', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
        incluirAnulados: true,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(true);
      }
    });

    it('incluirAnulados omitido → default false en el output', () => {
      const r = balanceComprobacionFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(false);
      }
    });
  });

  describe('campos no permitidos del contrato viejo', () => {
    it('no acepta modo + periodoFiscalId (contrato viejo eliminado)', () => {
      // El schema plano ignora campos desconocidos (zod strip por defecto),
      // pero periodoFiscalId no forma parte del output.
      const r = balanceComprobacionFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      // Parsea con éxito (zod strip), pero periodoFiscalId NO está en el output.
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data).not.toHaveProperty('modo');
        expect(r.data).not.toHaveProperty('periodoFiscalId');
      }
    });
  });
});
