import { describe, expect, it } from 'vitest';

import { libroMayorFiltroSchema } from './libro-mayor-filtro-schema';

// REQ-LM-01: exactamente uno de (periodoFiscalId) O (fechaDesde + fechaHasta)
describe('libroMayorFiltroSchema', () => {
  describe('modo períodoFiscal', () => {
    it('acepta solo periodoFiscalId', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(true);
    });

    it('rechaza periodoFiscalId vacío', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: '',
      });
      expect(r.success).toBe(false);
    });

    it('aplica defaults: incluirAnulados=false y soloConMovimiento=true', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(false);
        expect(r.data.soloConMovimiento).toBe(true);
      }
    });

    it('acepta toggles explícitos en modo periodo', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        incluirAnulados: true,
        soloConMovimiento: false,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(true);
        expect(r.data.soloConMovimiento).toBe(false);
      }
    });
  });

  describe('modo rango de fechas', () => {
    it('acepta fechaDesde + fechaHasta válidas', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
    });

    it('acepta fechaDesde === fechaHasta (mismo día)', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-05-15',
        fechaHasta: '2026-05-15',
      });
      expect(r.success).toBe(true);
    });

    it('rechaza fechaDesde > fechaHasta', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-05-31',
        fechaHasta: '2026-01-01',
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const msgs = r.error.issues.map((i) => i.message).join(' ');
        expect(msgs.toLowerCase()).toMatch(/fecha|rango/);
      }
    });

    it('rechaza modo rango sin fechaDesde', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza formato de fecha incorrecto', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '01/01/2026',
        fechaHasta: '31/03/2026',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('campo cuentaId', () => {
    it('modo periodo: acepta cuentaId UUID válido y lo preserva en el output', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        cuentaId: 'f1e2d3c4-b5a6-4f7e-8d9c-b0a1f2e3d4c5',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.cuentaId).toBe('f1e2d3c4-b5a6-4f7e-8d9c-b0a1f2e3d4c5');
      }
    });

    it('modo rango: acepta cuentaId UUID válido y lo preserva en el output', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
        cuentaId: 'f1e2d3c4-b5a6-4f7e-8d9c-b0a1f2e3d4c5',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.cuentaId).toBe('f1e2d3c4-b5a6-4f7e-8d9c-b0a1f2e3d4c5');
      }
    });

    it('modo periodo: sin cuentaId → cuentaId ausente en el output (campo opcional)', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.cuentaId).toBeUndefined();
      }
    });

    it('modo rango: sin cuentaId → cuentaId ausente en el output (campo opcional)', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.cuentaId).toBeUndefined();
      }
    });
  });

  describe('modo ausente o inválido', () => {
    it('rechaza sin modo', () => {
      const r = libroMayorFiltroSchema.safeParse({
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza modo inválido', () => {
      const r = libroMayorFiltroSchema.safeParse({
        modo: 'ambos',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(false);
    });
  });
});
