import { Email } from './email';
import { EmailInvalidoError } from './user-errors';

describe('Email', () => {
  describe('of — válidos', () => {
    it.each([
      'user@example.com',
      'a@b.co',
      'marco.tarqui.a@gmail.com',
      'contador+avicont@dominio.bo',
    ])('acepta "%s"', (raw) => {
      expect(() => Email.of(raw)).not.toThrow();
    });

    it('normaliza con trim y lowercase', () => {
      const email = Email.of('  User@Example.COM  ');
      expect(email.toString()).toBe('user@example.com');
    });
  });

  describe('of — inválidos', () => {
    it('rechaza string vacío', () => {
      expect(() => Email.of('')).toThrow(EmailInvalidoError);
    });

    it('rechaza solo espacios', () => {
      expect(() => Email.of('   ')).toThrow(EmailInvalidoError);
    });

    it.each([
      ['sin-arroba.com', 'sin @'],
      ['a@b', 'sin TLD'],
      ['a@@b.com', 'doble @'],
      ['a b@c.com', 'contiene espacio'],
      ['@dominio.com', 'sin local-part'],
      ['user@', 'sin dominio'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => Email.of(raw)).toThrow(EmailInvalidoError);
    });

    it('rechaza más de 254 caracteres (RFC 5321)', () => {
      const largo = 'a'.repeat(250) + '@b.co';
      expect(() => Email.of(largo)).toThrow(EmailInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => Email.of(123 as unknown as string)).toThrow(EmailInvalidoError);
      expect(() => Email.of(null as unknown as string)).toThrow(EmailInvalidoError);
      expect(() => Email.of(undefined as unknown as string)).toThrow(EmailInvalidoError);
    });
  });

  describe('equals', () => {
    it('true si el valor normalizado coincide', () => {
      const a = Email.of('User@Example.com');
      const b = Email.of('  user@example.COM  ');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = Email.of('a@b.com');
      const b = Email.of('c@d.com');
      expect(a.equals(b)).toBe(false);
    });
  });
});
