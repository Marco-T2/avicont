import { JwtClaims } from './jwt-claims';
import { JwtClaimsInvalidosError } from './auth-errors';
import { ImpersonationJwtClaims } from '../../impersonation/domain/impersonation-jwt-claims';

describe('JwtClaims', () => {
  describe('REQ-SA-02: claim isSuperAdmin en JWT', () => {
    it('forUser incluye isSuperAdmin: true solo cuando se pasa true', () => {
      const claims = JwtClaims.forUser({
        userId: 'user-1',
        email: 'a@b.com',
        isSuperAdmin: true,
      });
      expect(claims.toPayload().isSuperAdmin).toBe(true);
    });

    it('forUser NO incluye isSuperAdmin cuando es false', () => {
      const claims = JwtClaims.forUser({
        userId: 'user-1',
        email: 'a@b.com',
        isSuperAdmin: false,
      });
      expect(claims.toPayload()).not.toHaveProperty('isSuperAdmin');
    });

    it('forUser NO incluye isSuperAdmin cuando está ausente', () => {
      const claims = JwtClaims.forUser({
        userId: 'user-1',
        email: 'a@b.com',
      });
      expect(claims.toPayload()).not.toHaveProperty('isSuperAdmin');
    });

    it('token de impersonation no hereda isSuperAdmin (REQ-SA-04)', () => {
      const payload = ImpersonationJwtClaims.forImpersonation({
        targetUserId: 'target-uuid',
        targetEmail: 'target@avicont.bo',
        activeTenantId: 'tenant-uuid',
        roles: [],
        adminUserId: 'admin-uuid',
        impersonationId: 'imp-uuid',
      }).toPayload();
      expect(payload).not.toHaveProperty('isSuperAdmin');
    });
  });

  describe('forUser — válidos', () => {
    it('construye payload mínimo con sub y email', () => {
      const claims = JwtClaims.forUser({
        userId: 'user-1',
        email: 'a@b.com',
      });
      const payload = claims.toPayload();
      expect(payload.sub).toBe('user-1');
      expect(payload.email).toBe('a@b.com');
    });

    it('omite activeTenantId si no se pasa (exactOptional)', () => {
      const claims = JwtClaims.forUser({ userId: 'u', email: 'a@b.com' });
      expect(claims.toPayload()).not.toHaveProperty('activeTenantId');
    });

    it('incluye activeTenantId cuando se pasa', () => {
      const claims = JwtClaims.forUser({
        userId: 'u',
        email: 'a@b.com',
        activeTenantId: 'tenant-1',
      });
      expect(claims.toPayload().activeTenantId).toBe('tenant-1');
    });

    it('roles default a array vacío si no se pasa', () => {
      const claims = JwtClaims.forUser({ userId: 'u', email: 'a@b.com' });
      expect(claims.toPayload().roles).toEqual([]);
    });

    it('incluye roles cuando se pasan', () => {
      const claims = JwtClaims.forUser({
        userId: 'u',
        email: 'a@b.com',
        roles: ['OWNER', 'contador'],
      });
      expect(claims.toPayload().roles).toEqual(['OWNER', 'contador']);
    });
  });

  describe('forUser — inválidos', () => {
    it('rechaza userId vacío', () => {
      expect(() => JwtClaims.forUser({ userId: '', email: 'a@b.com' })).toThrow(
        JwtClaimsInvalidosError,
      );
    });

    it('rechaza email vacío', () => {
      expect(() => JwtClaims.forUser({ userId: 'u', email: '' })).toThrow(JwtClaimsInvalidosError);
    });

    it('rechaza activeTenantId vacío cuando se pasa', () => {
      expect(() =>
        JwtClaims.forUser({ userId: 'u', email: 'a@b.com', activeTenantId: '' }),
      ).toThrow(JwtClaimsInvalidosError);
    });
  });
});
