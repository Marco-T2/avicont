import { ImpersonationWindow } from './impersonation-window';
import { ImpersonationWindowInvalidaError } from './impersonation-errors';

describe('ImpersonationWindow', () => {
  describe('default()', () => {
    it('retorna ventana de 30 minutos (CLAUDE.md §5.6)', () => {
      const w = ImpersonationWindow.default();
      expect(w.durationMinutes()).toBe(30);
      expect(w.toExpiresIn()).toBe('30m');
    });
  });

  describe('ofMinutes — válidos', () => {
    it.each([
      [1, '1m'],
      [30, '30m'],
      [60, '60m'],
      [480, '480m'],
    ])('acepta %i minutos → toExpiresIn "%s"', (minutes, expected) => {
      const w = ImpersonationWindow.ofMinutes(minutes);
      expect(w.toExpiresIn()).toBe(expected);
      expect(w.durationMinutes()).toBe(minutes);
    });
  });

  describe('ofMinutes — inválidos', () => {
    it.each([
      [0, 'debajo del mínimo'],
      [-5, 'negativo'],
      [481, 'excede el máximo'],
      [1.5, 'no entero'],
    ])('rechaza %p (%s)', (minutes) => {
      expect(() => ImpersonationWindow.ofMinutes(minutes)).toThrow(
        ImpersonationWindowInvalidaError,
      );
    });

    it('rechaza NaN', () => {
      expect(() => ImpersonationWindow.ofMinutes(NaN)).toThrow(
        ImpersonationWindowInvalidaError,
      );
    });
  });

  describe('expiresAt', () => {
    it('suma durationMinutes al timestamp pasado', () => {
      const from = new Date('2026-04-24T12:00:00Z');
      const w = ImpersonationWindow.ofMinutes(30);
      const expires = w.expiresAt(from);
      expect(expires.toISOString()).toBe('2026-04-24T12:30:00.000Z');
    });

    it('no muta el Date de entrada', () => {
      const from = new Date('2026-04-24T12:00:00Z');
      const original = from.getTime();
      ImpersonationWindow.default().expiresAt(from);
      expect(from.getTime()).toBe(original);
    });
  });

  describe('equals', () => {
    it('true si mismos minutos', () => {
      expect(
        ImpersonationWindow.default().equals(ImpersonationWindow.ofMinutes(30)),
      ).toBe(true);
    });

    it('false si distintos', () => {
      expect(
        ImpersonationWindow.ofMinutes(30).equals(ImpersonationWindow.ofMinutes(60)),
      ).toBe(false);
    });
  });
});
