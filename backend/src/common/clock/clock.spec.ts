import { FakeClockAdapter } from './fake-clock.adapter';
import { SystemClockAdapter } from './system-clock.adapter';

describe('SystemClockAdapter', () => {
  it('now() devuelve un Date reciente (tolerancia 1 segundo)', () => {
    const clock = new SystemClockAdapter();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it('currentYearLaPaz() devuelve el año calendario en La Paz', () => {
    const clock = new SystemClockAdapter();
    const year = clock.currentYearLaPaz();
    // Sanity check — el año debe estar en un rango razonable
    expect(year).toBeGreaterThanOrEqual(2020);
    expect(year).toBeLessThanOrEqual(2100);
  });

  it('currentDateLaPaz() devuelve un ISO YYYY-MM-DD', () => {
    const clock = new SystemClockAdapter();
    const date = clock.currentDateLaPaz();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('FakeClockAdapter', () => {
  let clock: FakeClockAdapter;

  beforeEach(() => {
    clock = new FakeClockAdapter();
  });

  it('arranca con fecha por defecto 2026-04-23', () => {
    expect(clock.currentDateLaPaz()).toBe('2026-04-23');
  });

  it('setTo(iso) fija el reloj a ese instante', () => {
    clock.setTo('2027-01-01T12:00:00.000Z');
    expect(clock.currentDateLaPaz()).toBe('2027-01-01');
    expect(clock.currentYearLaPaz()).toBe(2027);
  });

  it('now() devuelve una copia (inmutabilidad hacia afuera)', () => {
    const d1 = clock.now();
    d1.setFullYear(1999);
    const d2 = clock.now();
    expect(d2.getFullYear()).not.toBe(1999);
  });

  describe('cruce de año en frontera de medianoche La Paz (UTC-4)', () => {
    it('31/12/2026 22:00 UTC = 31/12/2026 18:00 La Paz → año 2026', () => {
      clock.setTo('2026-12-31T22:00:00.000Z');
      expect(clock.currentYearLaPaz()).toBe(2026);
      expect(clock.currentDateLaPaz()).toBe('2026-12-31');
    });

    it('01/01/2027 02:00 UTC = 31/12/2026 22:00 La Paz → año todavía 2026', () => {
      clock.setTo('2027-01-01T02:00:00.000Z');
      expect(clock.currentYearLaPaz()).toBe(2026);
      expect(clock.currentDateLaPaz()).toBe('2026-12-31');
    });

    it('01/01/2027 04:00 UTC = 01/01/2027 00:00 La Paz → año 2027', () => {
      clock.setTo('2027-01-01T04:00:00.000Z');
      expect(clock.currentYearLaPaz()).toBe(2027);
      expect(clock.currentDateLaPaz()).toBe('2027-01-01');
    });
  });
});
