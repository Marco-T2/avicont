import { ActivityCursor } from './activity-cursor';
import { PlatformActivityCursorInvalidoError } from '../domain/platform-errors';

describe('ActivityCursor', () => {
  describe('encode / decode — roundtrip', () => {
    it('encode seguido de decode devuelve los valores originales', () => {
      const createdAt = new Date('2026-06-02T14:30:00.000Z');
      const id = '11111111-2222-4333-8444-555555555555';

      const token = ActivityCursor.encode(createdAt, id);
      const decoded = ActivityCursor.decode(token);

      expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
      expect(decoded.id).toBe(id);
    });

    it('el token es base64 opaco (no contiene la fecha en claro)', () => {
      const createdAt = new Date('2026-06-02T14:30:00.000Z');
      const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

      const token = ActivityCursor.encode(createdAt, id);

      // El token NO debe ser legible en claro (debe ser base64)
      expect(token).not.toContain('2026');
      expect(token).not.toContain(id);
    });

    it('múltiples encodes con diferentes fechas/ids son distintos', () => {
      const t1 = ActivityCursor.encode(new Date('2026-06-01T00:00:00.000Z'), 'aaa');
      const t2 = ActivityCursor.encode(new Date('2026-06-02T00:00:00.000Z'), 'bbb');
      expect(t1).not.toBe(t2);
    });
  });

  describe('decode — errores', () => {
    it('token vacío → PlatformActivityCursorInvalidoError', () => {
      expect(() => ActivityCursor.decode('')).toThrow(PlatformActivityCursorInvalidoError);
    });

    it('string no-base64 → PlatformActivityCursorInvalidoError', () => {
      expect(() => ActivityCursor.decode('no-es-base64!!!')).toThrow(
        PlatformActivityCursorInvalidoError,
      );
    });

    it('base64 válido pero sin separador | → PlatformActivityCursorInvalidoError', () => {
      const noSeparador = Buffer.from('sinSeparador').toString('base64url');
      expect(() => ActivityCursor.decode(noSeparador)).toThrow(PlatformActivityCursorInvalidoError);
    });

    it('fecha inválida → PlatformActivityCursorInvalidoError', () => {
      const malformado = Buffer.from('not-a-date|some-id').toString('base64url');
      expect(() => ActivityCursor.decode(malformado)).toThrow(PlatformActivityCursorInvalidoError);
    });

    it('cursor con parte de id vacía → PlatformActivityCursorInvalidoError', () => {
      const sinId = Buffer.from('2026-06-02T14:30:00.000Z|').toString('base64url');
      expect(() => ActivityCursor.decode(sinId)).toThrow(PlatformActivityCursorInvalidoError);
    });
  });
});
