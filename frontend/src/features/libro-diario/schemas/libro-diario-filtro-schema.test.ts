import { describe, expect, it } from 'vitest';

import { libroDiarioFiltroSchema } from './libro-diario-filtro-schema';

// REQ-LD-01: exactamente uno de (periodoFiscalId) O (fechaDesde + fechaHasta)
describe('libroDiarioFiltroSchema', () => {
  describe('modo períodoFiscalId', () => {
    it('acepta solo periodoFiscalId', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(true);
    });

    it('rechaza periodoFiscalId vacío', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: '',
      });
      expect(r.success).toBe(false);
    });

    it('acepta toggle incluirAnulados en modo periodo', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        incluirAnulados: true,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(true);
      }
    });

    it('incluirAnulados explícito false es válido', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'periodo',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        incluirAnulados: false,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.incluirAnulados).toBe(false);
      }
    });
  });

  describe('modo rango de fechas', () => {
    it('acepta fechaDesde + fechaHasta válidas', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(true);
    });

    it('acepta fechaDesde === fechaHasta (mismo día)', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-05-15',
        fechaHasta: '2026-05-15',
      });
      expect(r.success).toBe(true);
    });

    it('rechaza fechaDesde > fechaHasta', () => {
      const r = libroDiarioFiltroSchema.safeParse({
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
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'rango',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza modo rango sin fechaHasta', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '2026-01-01',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza formato de fecha incorrecto', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'rango',
        fechaDesde: '01/01/2026',
        fechaHasta: '31/03/2026',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('modo ausente o inválido', () => {
    it('rechaza sin modo', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      });
      expect(r.success).toBe(false);
    });

    it('rechaza modo inválido', () => {
      const r = libroDiarioFiltroSchema.safeParse({
        modo: 'ambos',
        periodoFiscalId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-03-31',
      });
      expect(r.success).toBe(false);
    });
  });
});
