import { describe, expect, it } from 'vitest';

import { libroMayorFiltroSchema } from './libro-mayor-filtro-schema';

// Contrato simplificado: siempre rango de fechas (fechaDesde + fechaHasta).
// No hay más discriminante 'modo' ni periodoFiscalId.
describe('libroMayorFiltroSchema', () => {
  describe('rango de fechas válido', () => {
    it('acepta fechaDesde + fechaHasta válidas', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
    });

    it('acepta fechaDesde === fechaHasta (mismo día)', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-05-15',
        fechaHasta: '2026-05-15',
      });
      expect(r.success).toBe(true);
    });

    it('rechaza fechaDesde > fechaHasta', () => {
      const r = libroMayorFiltroSchema.safeParse({
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
      const r = libroMayorFiltroSchema.safeParse({
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza sin fechaHasta', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza formato de fecha incorrecto', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '01/01/2026',
        fechaHasta: '31/03/2026',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('incluirAnulados', () => {
    it('aplica default: incluirAnulados=false', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(false);
      }
    });

    it('acepta incluirAnulados: true', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
        incluirAnulados: true,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(true);
      }
    });
  });

  describe('soloConMovimiento', () => {
    it('aplica default: soloConMovimiento=true', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.soloConMovimiento).toBe(true);
      }
    });

    it('acepta soloConMovimiento: false', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
        soloConMovimiento: false,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.soloConMovimiento).toBe(false);
      }
    });
  });

  describe('campo cuentaId', () => {
    it('acepta cuentaId UUID válido y lo preserva en el output', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
        cuentaId: 'f1e2d3c4-b5a6-4f7e-8d9c-b0a1f2e3d4c5',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.cuentaId).toBe('f1e2d3c4-b5a6-4f7e-8d9c-b0a1f2e3d4c5');
      }
    });

    it('sin cuentaId → cuentaId ausente en el output (campo opcional)', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.cuentaId).toBeUndefined();
      }
    });

    it('rechaza cuentaId con formato inválido (no UUID)', () => {
      const r = libroMayorFiltroSchema.safeParse({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
        cuentaId: 'no-es-un-uuid',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('campos no permitidos del contrato viejo', () => {
    it('no acepta modo + periodoFiscalId (contrato viejo eliminado)', () => {
      // El schema plano ignora campos desconocidos (zod strip por defecto),
      // pero periodoFiscalId no forma parte del output.
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      // Parsea con éxito (zod strip), pero periodoFiscalId y modo NO están en el output.
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data).not.toHaveProperty('modo');
        expect(r.data).not.toHaveProperty('periodoFiscalId');
      }
    });
  });
});
