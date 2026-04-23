import { FechaContable } from './fecha-contable';

describe('FechaContable', () => {
  describe('fromIso', () => {
    it('parsea un ISO válido a y/m/d', () => {
      const f = FechaContable.fromIso('2026-04-22');
      expect(f.year).toBe(2026);
      expect(f.month).toBe(4);
      expect(f.day).toBe(22);
    });

    it('rechaza formato con hora', () => {
      expect(() => FechaContable.fromIso('2026-04-22T00:00:00Z')).toThrow();
    });

    it('rechaza formato sin padding de ceros', () => {
      expect(() => FechaContable.fromIso('2026-4-22')).toThrow();
      expect(() => FechaContable.fromIso('2026-04-2')).toThrow();
    });

    it('rechaza string vacío', () => {
      expect(() => FechaContable.fromIso('')).toThrow();
    });

    it('rechaza mes 0 y 13', () => {
      expect(() => FechaContable.fromIso('2026-00-15')).toThrow();
      expect(() => FechaContable.fromIso('2026-13-15')).toThrow();
    });

    it('rechaza día 0 y días que no existen en el mes', () => {
      expect(() => FechaContable.fromIso('2026-04-00')).toThrow();
      expect(() => FechaContable.fromIso('2026-04-31')).toThrow();
      expect(() => FechaContable.fromIso('2026-06-31')).toThrow();
    });

    it('rechaza 29 de febrero en año NO bisiesto', () => {
      expect(() => FechaContable.fromIso('2025-02-29')).toThrow();
      expect(() => FechaContable.fromIso('2027-02-29')).toThrow();
    });

    it('acepta 29 de febrero en año bisiesto', () => {
      expect(() => FechaContable.fromIso('2024-02-29')).not.toThrow();
      expect(() => FechaContable.fromIso('2000-02-29')).not.toThrow();
    });

    it('rechaza 29 de febrero en años múltiplo de 100 no múltiplo de 400', () => {
      expect(() => FechaContable.fromIso('1900-02-29')).toThrow();
      expect(() => FechaContable.fromIso('2100-02-29')).toThrow();
    });
  });

  describe('of', () => {
    it('rechaza años fuera de rango', () => {
      expect(() => FechaContable.of(1899, 1, 1)).toThrow();
      expect(() => FechaContable.of(3000, 1, 1)).toThrow();
    });

    it('rechaza componentes no enteros', () => {
      expect(() => FechaContable.of(2026.5, 4, 22)).toThrow();
      expect(() => FechaContable.of(2026, 4.5, 22)).toThrow();
      expect(() => FechaContable.of(2026, 4, 22.5)).toThrow();
    });
  });

  describe('fromDbDate', () => {
    it('lee el día desde UTC, no desde zona local', () => {
      // Prisma @db.Date devuelve siempre midnight UTC del día correspondiente.
      const utcMidnight = new Date(Date.UTC(2026, 3, 22));
      const f = FechaContable.fromDbDate(utcMidnight);
      expect(f.toIso()).toBe('2026-04-22');
    });

    it('rechaza Date inválido', () => {
      expect(() => FechaContable.fromDbDate(new Date('invalid'))).toThrow();
    });
  });

  describe('toDbDate', () => {
    it('es idempotente con fromDbDate', () => {
      const original = FechaContable.fromIso('2026-04-22');
      const roundtrip = FechaContable.fromDbDate(original.toDbDate());
      expect(roundtrip.equals(original)).toBe(true);
    });

    it('siempre devuelve midnight UTC', () => {
      const d = FechaContable.fromIso('2026-04-22').toDbDate();
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
      expect(d.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('toIso', () => {
    it('padea ceros en mes y día', () => {
      expect(FechaContable.of(2026, 1, 5).toIso()).toBe('2026-01-05');
      expect(FechaContable.of(2026, 12, 31).toIso()).toBe('2026-12-31');
    });
  });

  describe('compare / isBefore / isAfter / equals', () => {
    const a = FechaContable.fromIso('2026-04-22');
    const b = FechaContable.fromIso('2026-04-23');
    const c = FechaContable.fromIso('2026-04-22');

    it('equals iguales → true', () => {
      expect(a.equals(c)).toBe(true);
    });

    it('equals distintos → false', () => {
      expect(a.equals(b)).toBe(false);
    });

    it('isBefore', () => {
      expect(a.isBefore(b)).toBe(true);
      expect(b.isBefore(a)).toBe(false);
      expect(a.isBefore(c)).toBe(false);
    });

    it('isAfter', () => {
      expect(b.isAfter(a)).toBe(true);
      expect(a.isAfter(b)).toBe(false);
      expect(a.isAfter(c)).toBe(false);
    });

    it('compare', () => {
      expect(a.compare(b)).toBe(-1);
      expect(b.compare(a)).toBe(1);
      expect(a.compare(c)).toBe(0);
    });

    it('compara años distintos', () => {
      const y2025 = FechaContable.fromIso('2025-12-31');
      const y2026 = FechaContable.fromIso('2026-01-01');
      expect(y2025.isBefore(y2026)).toBe(true);
    });
  });
});
