import { ImpersonationJwtClaims } from './impersonation-jwt-claims';
import { ImpersonationJwtClaimsInvalidosError } from './impersonation-errors';

describe('ImpersonationJwtClaims', () => {
  const params = () => ({
    targetUserId: 'target-uuid',
    targetEmail: 'target@avicont.bo',
    activeTenantId: 'tenant-uuid',
    roles: ['contador'],
    adminUserId: 'admin-uuid',
    impersonationId: 'imp-uuid',
  });

  describe('forImpersonation — válidos', () => {
    it('arma payload con claims obligatorios de impersonation', () => {
      const payload = ImpersonationJwtClaims.forImpersonation(params()).toPayload();
      expect(payload).toEqual({
        sub: 'target-uuid',
        email: 'target@avicont.bo',
        activeTenantId: 'tenant-uuid',
        roles: ['contador'],
        impersonatedBy: 'admin-uuid',
        impersonationId: 'imp-uuid',
      });
    });

    it('copia el array de roles (no referencia)', () => {
      const input = params();
      const payload = ImpersonationJwtClaims.forImpersonation(input).toPayload();
      input.roles.push('mutated');
      expect(payload.roles).toEqual(['contador']);
    });

    it('acepta roles vacíos', () => {
      const payload = ImpersonationJwtClaims.forImpersonation({
        ...params(),
        roles: [],
      }).toPayload();
      expect(payload.roles).toEqual([]);
    });
  });

  describe('forImpersonation — inválidos', () => {
    it.each([
      ['targetUserId', { targetUserId: '' }],
      ['targetEmail', { targetEmail: '' }],
      ['activeTenantId', { activeTenantId: '' }],
      ['adminUserId', { adminUserId: '' }],
      ['impersonationId', { impersonationId: '' }],
    ])('rechaza %s vacío', (_field, override) => {
      expect(() => ImpersonationJwtClaims.forImpersonation({ ...params(), ...override })).toThrow(
        ImpersonationJwtClaimsInvalidosError,
      );
    });

    it('rechaza roles no-array', () => {
      expect(() =>
        ImpersonationJwtClaims.forImpersonation({
          ...params(),
          roles: 'contador' as unknown as string[],
        }),
      ).toThrow(ImpersonationJwtClaimsInvalidosError);
    });
  });
});
