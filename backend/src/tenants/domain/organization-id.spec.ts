import { OrganizationId } from './organization-id';
import { OrganizationIdInvalidoError } from './tenant-errors';

describe('OrganizationId', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000';

  describe('of — válidos', () => {
    it('acepta UUID canónico', () => {
      expect(() => OrganizationId.of(UUID)).not.toThrow();
    });

    it('normaliza a lowercase', () => {
      const id = OrganizationId.of(UUID.toUpperCase());
      expect(id.toString()).toBe(UUID);
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['', 'vacío'],
      ['not-a-uuid', 'formato arbitrario'],
      ['550e8400-e29b-41d4-a716', 'truncado'],
      ['xxxxxxxx-e29b-41d4-a716-446655440000', 'caracteres no hex'],
      ['550e8400e29b41d4a716446655440000', 'sin guiones'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => OrganizationId.of(raw)).toThrow(OrganizationIdInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => OrganizationId.of(null as unknown as string)).toThrow(
        OrganizationIdInvalidoError,
      );
      expect(() => OrganizationId.of(undefined as unknown as string)).toThrow(
        OrganizationIdInvalidoError,
      );
      expect(() => OrganizationId.of(123 as unknown as string)).toThrow(
        OrganizationIdInvalidoError,
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor normalizado', () => {
      const a = OrganizationId.of(UUID);
      const b = OrganizationId.of(UUID.toUpperCase());
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = OrganizationId.of(UUID);
      const b = OrganizationId.of('11111111-2222-4333-8444-555555555555');
      expect(a.equals(b)).toBe(false);
    });
  });
});
