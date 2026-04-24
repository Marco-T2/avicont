import { SystemRole } from '@prisma/client';

import { AsignacionRolInvalidaError } from './membership-errors';
import { MembershipRole } from './membership-role';

describe('MembershipRole', () => {
  const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';

  describe('ofSystem', () => {
    it('acepta OWNER', () => {
      const r = MembershipRole.ofSystem(SystemRole.OWNER);
      expect(r.systemRole).toBe(SystemRole.OWNER);
      expect(r.customRoleId).toBeNull();
      expect(r.isOwner()).toBe(true);
      expect(r.isSystemRole()).toBe(true);
    });

    it('acepta ADMIN', () => {
      const r = MembershipRole.ofSystem(SystemRole.ADMIN);
      expect(r.systemRole).toBe(SystemRole.ADMIN);
      expect(r.customRoleId).toBeNull();
      expect(r.isOwner()).toBe(false);
      expect(r.isSystemRole()).toBe(true);
    });
  });

  describe('ofCustom', () => {
    it('acepta UUID válido', () => {
      const r = MembershipRole.ofCustom(UUID_V4);
      expect(r.systemRole).toBeNull();
      expect(r.customRoleId).toBe(UUID_V4);
      expect(r.isOwner()).toBe(false);
      expect(r.isSystemRole()).toBe(false);
    });

    it('normaliza el UUID a lowercase', () => {
      const r = MembershipRole.ofCustom(UUID_V4.toUpperCase());
      expect(r.customRoleId).toBe(UUID_V4);
    });

    it.each([
      ['', 'string vacío'],
      ['not-a-uuid', 'formato arbitrario'],
      ['550e8400-e29b-41d4-a716', 'truncado'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => MembershipRole.ofCustom(raw)).toThrow(
        AsignacionRolInvalidaError,
      );
    });

    it('rechaza tipos no-string', () => {
      expect(() =>
        MembershipRole.ofCustom(null as unknown as string),
      ).toThrow(AsignacionRolInvalidaError);
      expect(() =>
        MembershipRole.ofCustom(undefined as unknown as string),
      ).toThrow(AsignacionRolInvalidaError);
    });
  });

  describe('parse — válidos', () => {
    it('solo systemRole', () => {
      const r = MembershipRole.parse({ systemRole: SystemRole.OWNER });
      expect(r.systemRole).toBe(SystemRole.OWNER);
      expect(r.customRoleId).toBeNull();
    });

    it('solo customRoleId', () => {
      const r = MembershipRole.parse({ customRoleId: UUID_V4 });
      expect(r.systemRole).toBeNull();
      expect(r.customRoleId).toBe(UUID_V4);
    });

    it('systemRole con customRoleId null explícito', () => {
      const r = MembershipRole.parse({
        systemRole: SystemRole.ADMIN,
        customRoleId: null,
      });
      expect(r.systemRole).toBe(SystemRole.ADMIN);
    });

    it('customRoleId con systemRole null explícito', () => {
      const r = MembershipRole.parse({
        systemRole: null,
        customRoleId: UUID_V4,
      });
      expect(r.customRoleId).toBe(UUID_V4);
    });

    it('systemRole + customRoleId vacío = systemRole válido', () => {
      const r = MembershipRole.parse({
        systemRole: SystemRole.OWNER,
        customRoleId: '',
      });
      expect(r.systemRole).toBe(SystemRole.OWNER);
    });

    it('trimea whitespace del customRoleId antes de validar', () => {
      const r = MembershipRole.parse({ customRoleId: `  ${UUID_V4}  ` });
      expect(r.customRoleId).toBe(UUID_V4);
    });
  });

  describe('parse — inválidos', () => {
    it('rechaza ambos presentes', () => {
      expect(() =>
        MembershipRole.parse({
          systemRole: SystemRole.OWNER,
          customRoleId: UUID_V4,
        }),
      ).toThrow(AsignacionRolInvalidaError);
    });

    it('rechaza ninguno presente', () => {
      expect(() => MembershipRole.parse({})).toThrow(
        AsignacionRolInvalidaError,
      );
    });

    it('trata customRoleId vacío como no-presente', () => {
      expect(() => MembershipRole.parse({ customRoleId: '' })).toThrow(
        AsignacionRolInvalidaError,
      );
    });

    it('trata customRoleId con solo espacios como no-presente', () => {
      expect(() => MembershipRole.parse({ customRoleId: '   ' })).toThrow(
        AsignacionRolInvalidaError,
      );
    });
  });

  describe('equals', () => {
    it('true para systemRoles iguales', () => {
      const a = MembershipRole.ofSystem(SystemRole.OWNER);
      const b = MembershipRole.ofSystem(SystemRole.OWNER);
      expect(a.equals(b)).toBe(true);
    });

    it('false para systemRoles distintos', () => {
      const a = MembershipRole.ofSystem(SystemRole.OWNER);
      const b = MembershipRole.ofSystem(SystemRole.ADMIN);
      expect(a.equals(b)).toBe(false);
    });

    it('true para customRoleIds iguales (normalizados)', () => {
      const a = MembershipRole.ofCustom(UUID_V4);
      const b = MembershipRole.ofCustom(UUID_V4.toUpperCase());
      expect(a.equals(b)).toBe(true);
    });

    it('false entre system y custom', () => {
      const a = MembershipRole.ofSystem(SystemRole.ADMIN);
      const b = MembershipRole.ofCustom(UUID_V4);
      expect(a.equals(b)).toBe(false);
    });
  });
});
