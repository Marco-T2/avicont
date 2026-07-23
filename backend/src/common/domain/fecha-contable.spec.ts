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

  describe('toString', () => {
    it('delega en toIso', () => {
      const f = FechaContable.fromIso('2026-04-22');
      expect(f.toString()).toBe(f.toIso());
      expect(f.toString()).toBe('2026-04-22');
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

  // conciliacion-bancaria design §5.4: la ventana de sugerencias ±3 días
  // necesita aritmética de fechas. Se extiende el VO, no se duplica el
  // helper suelto de reportes/fecha-contable.ts (ver design §5.4).
  describe('sumarDias', () => {
    it('suma días dentro del mismo mes', () => {
      expect(FechaContable.fromIso('2026-06-10').sumarDias(3).toIso()).toBe('2026-06-13');
    });

    it('cruza de mes', () => {
      expect(FechaContable.fromIso('2026-06-29').sumarDias(3).toIso()).toBe('2026-07-02');
    });

    it('cruza de año', () => {
      expect(FechaContable.fromIso('2026-12-30').sumarDias(3).toIso()).toBe('2027-01-02');
    });

    it('respeta año bisiesto (28 → 29 feb 2028)', () => {
      expect(FechaContable.fromIso('2028-02-28').sumarDias(1).toIso()).toBe('2028-02-29');
    });

    it('respeta año NO bisiesto (28 feb 2026 → 1 mar, sin 29)', () => {
      expect(FechaContable.fromIso('2026-02-28').sumarDias(1).toIso()).toBe('2026-03-01');
    });

    it('n negativo resta (equivalente a restarDias)', () => {
      expect(FechaContable.fromIso('2026-06-10').sumarDias(-3).toIso()).toBe('2026-06-07');
    });

    it('n=0 devuelve la misma fecha', () => {
      expect(FechaContable.fromIso('2026-06-10').sumarDias(0).toIso()).toBe('2026-06-10');
    });
  });

  describe('restarDias', () => {
    it('resta días dentro del mismo mes', () => {
      expect(FechaContable.fromIso('2026-06-10').restarDias(3).toIso()).toBe('2026-06-07');
    });

    it('cruza de mes hacia atrás', () => {
      expect(FechaContable.fromIso('2026-07-02').restarDias(3).toIso()).toBe('2026-06-29');
    });

    it('cruza de año hacia atrás', () => {
      expect(FechaContable.fromIso('2027-01-02').restarDias(3).toIso()).toBe('2026-12-30');
    });

    it('respeta año bisiesto hacia atrás (29 feb 2028 → 28 feb)', () => {
      expect(FechaContable.fromIso('2028-02-29').restarDias(1).toIso()).toBe('2028-02-28');
    });

    it('es la inversa exacta de sumarDias', () => {
      const original = FechaContable.fromIso('2026-06-10');
      expect(original.sumarDias(5).restarDias(5).equals(original)).toBe(true);
    });
  });

  describe('diferenciaEnDias', () => {
    it('positivo si this es posterior a other', () => {
      const a = FechaContable.fromIso('2026-06-13');
      const b = FechaContable.fromIso('2026-06-10');
      expect(a.diferenciaEnDias(b)).toBe(3);
    });

    it('negativo si this es anterior a other', () => {
      const a = FechaContable.fromIso('2026-06-10');
      const b = FechaContable.fromIso('2026-06-13');
      expect(a.diferenciaEnDias(b)).toBe(-3);
    });

    it('cero si son la misma fecha', () => {
      const a = FechaContable.fromIso('2026-06-10');
      expect(a.diferenciaEnDias(a)).toBe(0);
    });

    it('cruza de mes y año correctamente', () => {
      const a = FechaContable.fromIso('2027-01-02');
      const b = FechaContable.fromIso('2026-12-30');
      expect(a.diferenciaEnDias(b)).toBe(3);
    });

    it('consistente con sumarDias: a.sumarDias(n) da diferenciaEnDias(a) === n', () => {
      const a = FechaContable.fromIso('2026-06-10');
      const b = a.sumarDias(7);
      expect(b.diferenciaEnDias(a)).toBe(7);
    });
  });
});
